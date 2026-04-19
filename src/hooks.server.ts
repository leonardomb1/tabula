import type { Handle } from '@sveltejs/kit';
import { verifySession } from '$lib/server/auth';
import { canAccess } from '$lib/server/workspaces';

const PUBLIC_PATHS = ['/login', '/public', '/api/attachments/', '/api/branding/', '/auth/'];

export const handle: Handle = async ({ event, resolve }) => {
	const sessionCookie = event.cookies.get('docs_session');
	event.locals.user = verifySession(sessionCookie);

	const { pathname } = event.url;

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
