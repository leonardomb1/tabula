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
 */
export const GET: RequestHandler = ({ url }) => {
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
