import { error, type RequestHandler } from '@sveltejs/kit';
import { storage } from '$lib/server/storage';

const ALLOWED = new Set(['logo.svg', 'logo_negative.svg']);

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const file = params.file ?? '';
	if (!ALLOWED.has(file)) throw error(404, 'not found');

	const bytes = await storage().tryReadBinary(`branding/${file}`);
	if (!bytes) throw error(404, 'not found');

	setHeaders({ 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
	return new Response(bytes as unknown as BodyInit);
};
