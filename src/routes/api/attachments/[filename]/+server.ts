import { error } from '@sveltejs/kit';
import { getBinary } from '$lib/server/storage';
import { attachmentsPrefix } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

const MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	pdf: 'application/pdf',
	txt: 'text/plain',
	csv: 'text/csv',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	zip: 'application/zip'
};

export const GET: RequestHandler = async ({ params, url }) => {
	const { filename } = params;
	if (!/^[a-zA-Z0-9._-]+$/.test(filename)) error(400, 'Nome inválido');
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;

	const buf = await getBinary(`${attachmentsPrefix(wsId)}${filename}`);
	if (!buf) error(404, 'Arquivo não encontrado');

	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	const mime = MIME[ext] ?? 'application/octet-stream';

	return new Response(buf, {
		headers: {
			'content-type': mime,
			'cache-control': 'public, max-age=31536000, immutable',
			'content-disposition': `inline; filename="${filename.replace(/^[^-]+-/, '')}"`
		}
	});
};
