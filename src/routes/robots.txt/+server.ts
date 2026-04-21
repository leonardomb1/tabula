import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * robots.txt — allow the public surface only, block everything else
 * (auth-gated app, internal APIs, settings, editor). The Sitemap
 * directive points crawlers at /sitemap.xml for the full list of
 * canonical public URLs.
 *
 * `Allow: /public` is a prefix match so it covers `/public` and
 * `/public/<slug>/<title>`. The earlier `Disallow: /` is overridden
 * for those paths — standard robots.txt semantics.
 *
 * Opt-in via `TABULA_ROBOTS_TXT=true`. When the env is unset (default),
 * the route returns 404 so whatever the hosting layer has configured
 * (e.g. Cloudflare's Managed Content / AI-bot blocklist) serves
 * instead. Flip the env on to take control back at the origin.
 */

function enabled(): boolean {
	const v = (process.env.TABULA_ROBOTS_TXT ?? '').toLowerCase();
	return v === 'true' || v === '1' || v === 'yes';
}

export const GET: RequestHandler = ({ url }) => {
	if (!enabled()) error(404, 'Not found');

	const body =
		`User-agent: *\n` +
		`Allow: /public\n` +
		`Disallow: /\n` +
		`\n` +
		`Sitemap: ${url.origin}/sitemap.xml\n`;
	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
