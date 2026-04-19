import { json, error } from '@sveltejs/kit';
import { isPlatformAdmin } from '$lib/server/workspaces';
import {
	createWorkspace,
	isValidWsId,
	listAllWorkspaces
} from '$lib/server/workspacesAdmin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!isPlatformAdmin(locals.user)) error(403, 'Apenas administradores da plataforma');
	const rows = await listAllWorkspaces();
	return json({ workspaces: rows });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!isPlatformAdmin(locals.user)) error(403, 'Apenas administradores da plataforma podem criar workspaces');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Corpo JSON inválido');
	const { id, name } = body as { id?: unknown; name?: unknown };

	if (!isValidWsId(id)) error(400, 'id inválido — use letras minúsculas, números e hífens (2–64 chars)');
	if (typeof name !== 'string' || name.trim().length === 0 || name.length > 120)
		error(400, 'name obrigatório (1–120 chars)');

	try {
		const ws = await createWorkspace(locals.user.username, id, name.trim());
		return json({ workspace: ws }, { status: 201 });
	} catch (e) {
		// Unique violation on primary key
		if (e instanceof Error && /duplicate key|already exists/i.test(e.message)) {
			error(409, `Workspace "${id}" já existe`);
		}
		throw e;
	}
};
