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
			'cache-control': 'public, max-age=3600'
		}
	});
};
