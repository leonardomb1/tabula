import { json, error } from '@sveltejs/kit';
import { canMaintain } from '$lib/server/workspaces';
import {
	deleteWorkspace,
	isValidWsId,
	renameWorkspace
} from '$lib/server/workspacesAdmin';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { ws } = params;
	if (!isValidWsId(ws)) error(400, 'Workspace inválido');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canMaintain(locals.user, ws))) error(403, 'Sem permissão para editar este workspace');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Corpo JSON inválido');
	const { name } = body as { name?: unknown };

	if (typeof name !== 'string' || name.trim().length === 0 || name.length > 120)
		error(400, 'name obrigatório (1–120 chars)');

	const updated = await renameWorkspace(locals.user.username, ws, name.trim());
	if (!updated) error(404, 'Workspace não encontrado');
	return json({ workspace: updated });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { ws } = params;
	if (!isValidWsId(ws)) error(400, 'Workspace inválido');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canMaintain(locals.user, ws))) error(403, 'Sem permissão para excluir este workspace');

	try {
		const ok = await deleteWorkspace(locals.user.username, ws);
		if (!ok) error(404, 'Workspace não encontrado');
	} catch (e) {
		if (e instanceof Error && /default workspace/i.test(e.message)) {
			error(400, 'O workspace padrão não pode ser excluído');
		}
		throw e;
	}
	return json({ ok: true });
};
