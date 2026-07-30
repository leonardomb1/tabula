import type { RequestHandler } from '@sveltejs/kit';
import { wikiMode } from '$lib/server/wiki';

// Only the wiki is ever crawlable, and only when it is internet-facing.
export const GET: RequestHandler = () => {
	const body =
		wikiMode() === 'anonymous'
			? 'User-agent: *\nAllow: /wiki\nAllow: /api/attachments/\nAllow: /api/render/typst/\nDisallow: /\n'
			: 'User-agent: *\nDisallow: /\n';
	return new Response(body, {
		headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' }
	});
};
