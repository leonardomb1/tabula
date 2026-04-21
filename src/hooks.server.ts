import type { Handle } from '@sveltejs/kit';
import { verifySession } from '$lib/server/auth';
import { canAccess } from '$lib/server/workspaces';
import {
	acceptsMarkdown,
	buildPublicIndexMarkdown,
	findPublicDocMarkdown
} from '$lib/server/publicMarkdown';

const PUBLIC_PATHS = ['/login', '/public', '/api/attachments/', '/api/branding/', '/auth/'];

// `/public`, `/public/<slug>`, `/public/<slug>/<title>` — the three
// shapes we short-circuit into a raw-markdown response when the client
// sends `Accept: text/markdown`. Anchored regex so `/publicsomething`
// doesn't accidentally match.
const PUBLIC_DOC_PATH_RE = /^\/public\/([A-Za-z0-9_-]+)(?:\/[a-z0-9-]+)?\/?$/;

export const handle: Handle = async ({ event, resolve }) => {
	const sessionCookie = event.cookies.get('docs_session');
	event.locals.user = verifySession(sessionCookie);

	const { pathname } = event.url;

	// ── Markdown-for-Agents negotiation ──────────────────────────────
	// Cloudflare's recommended pattern: requests with `Accept:
	// text/markdown` on the public surface get the raw markdown source
	// (for individual docs) or a generated markdown listing (for the
	// index). Browsers never set that Accept value, so HTML stays the
	// default. Runs before auth because `/public/*` is already public.
	if (acceptsMarkdown(event.request.headers.get('accept'))) {
		if (pathname === '/public' || pathname === '/public/') {
			const body = await buildPublicIndexMarkdown(event.url.origin);
			return new Response(body, {
				headers: {
					'content-type': 'text/markdown; charset=utf-8',
					'cache-control': 'public, max-age=300',
					vary: 'Accept'
				}
			});
		}
		const docMatch = pathname.match(PUBLIC_DOC_PATH_RE);
		if (docMatch) {
			const doc = await findPublicDocMarkdown(docMatch[1]);
			if (doc) {
				return new Response(doc.source, {
					headers: {
						'content-type': 'text/markdown; charset=utf-8',
						'last-modified': doc.mtime.toUTCString(),
						'cache-control': 'public, max-age=300',
						vary: 'Accept'
					}
				});
			}
			// No match: fall through to the HTML page's own 404 path so
			// the error is consistent across Accept headers.
		}
	}

	if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
		if (event.locals.user && pathname === '/login') {
			return new Response(null, { status: 302, headers: { location: '/' } });
		}
		return resolve(event);
	}

	if (!event.locals.user) {
		if (pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Não autenticado' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		const redirectTo = pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : '';
		return new Response(null, { status: 302, headers: { location: `/login${redirectTo}` } });
	}

	// Workspace membership gate. /w/<ws>/* takes ws from the path; API routes
	// pass it via ?ws=. Returns 404 (not 403) so non-members can't enumerate
	// workspace ids.
	const wsFromPath = pathname.startsWith('/w/') ? pathname.split('/')[2] : null;
	const wsFromQuery = event.url.searchParams.get('ws');
	const wsId = wsFromPath ?? wsFromQuery;
	if (wsId && !(await canAccess(event.locals.user, wsId))) {
		return new Response('Not found', { status: 404 });
	}

	return resolve(event);
};
