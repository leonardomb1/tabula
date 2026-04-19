import { error } from '@sveltejs/kit';
import { getBinary } from '$lib/server/storage';
import { prefixes } from '$lib/server/docsIndex';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	ico: 'image/x-icon'
};

export const GET: RequestHandler = async ({ params }) => {
	const { file } = params;
	if (!/^[a-zA-Z0-9._-]+$/.test(file)) error(400, 'Nome inválido');

	const buf = await getBinary(`${prefixes.branding}${file}`);
	if (!buf) error(404, 'Arquivo não encontrado');

	const ext = file.split('.').pop()?.toLowerCase() ?? '';
	return new Response(buf, {
		headers: {
			'content-type': MIME[ext] ?? 'application/octet-stream',
			// Aggressive client-side cache: 7 days fresh, 30 days stale-
			// while-revalidate. Branding assets change rarely; when they do,
			// a hard reload refreshes. `public` lets shared caches (CDNs,
			// corporate proxies) serve too. We serve *both* the positive
			// and negative logos on every page, so long cache is load-
			// bearing for perf.
			'cache-control': 'public, max-age=604800, stale-while-revalidate=2592000'
		}
	});
};
