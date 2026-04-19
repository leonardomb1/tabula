import { json, error } from '@sveltejs/kit';
import { putBinary } from '$lib/server/storage';
import { attachmentsPrefix } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID, canWrite } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_TYPES = new Set([
	'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
	'application/pdf',
	'text/plain', 'text/csv',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/zip',
]);

export const POST: RequestHandler = async ({ request, url, locals }) => {
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;

	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canWrite(locals.user, wsId))) error(403, 'Sem permissão para enviar arquivos');

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file || typeof file === 'string') error(400, 'Nenhum arquivo enviado');
	if (file.size > MAX_SIZE) error(400, 'Arquivo muito grande (máx 10 MB)');
	if (!ALLOWED_TYPES.has(file.type)) error(400, 'Tipo de arquivo não permitido');

	const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.toLowerCase() : '';
	const base = file.name
		.replace(/\.[^.]+$/, '')
		.replace(/[^a-zA-Z0-9_-]/g, '_')
		.slice(0, 60);
	const filename = `${Date.now()}-${base}${ext}`;

	await putBinary(`${attachmentsPrefix(wsId)}${filename}`, await file.arrayBuffer(), { type: file.type });

	return json({ url: `/api/attachments/${filename}?ws=${wsId}`, filename, originalName: file.name });
};
