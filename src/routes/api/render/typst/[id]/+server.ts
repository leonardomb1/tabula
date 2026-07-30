import { error, type RequestHandler } from '@sveltejs/kit';
import { storage } from '$lib/server/storage';
import { snippetStorageKey } from '$lib/server/typst';

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const id = params.id ?? '';
	if (!/^[a-f0-9]{64}$/.test(id)) throw error(400, 'invalid id');

	const svg = await storage().tryReadText(snippetStorageKey(id));
	if (svg === null) throw error(404, 'not found');

	setHeaders({
		'content-type': 'image/svg+xml',
		'cache-control': 'public, max-age=31536000, immutable'
	});
	return new Response(svg);
};
