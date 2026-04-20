import { json, error } from '@sveltejs/kit';
import { exists, remove } from '$lib/server/storage';
import { removeDoc, slugToKey } from '$lib/server/docsIndex';
import { canWrite, isRoutableWsId } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	const wsId = url.searchParams.get('ws');
	if (!isRoutableWsId(wsId)) error(400, 'Workspace inválido');

	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canWrite(locals.user, wsId))) error(403, 'Sem permissão para excluir deste workspace');

	const key = slugToKey(wsId, slug);
	if (!(await exists(key))) error(404, 'Documento não encontrado');

	await remove(key);
	await removeDoc(wsId, slug);

	return json({ ok: true });
};
