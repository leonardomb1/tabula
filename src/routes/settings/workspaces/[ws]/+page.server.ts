import { error } from '@sveltejs/kit';
import { canMaintain } from '$lib/server/workspaces';
import { listBindings, isValidWsId } from '$lib/server/workspacesAdmin';
import { sql } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { ws: wsId } = params;
	if (!isValidWsId(wsId)) error(400, 'Workspace inválido');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canMaintain(locals.user, wsId))) error(403, 'Apenas mantenedores podem abrir as configurações');

	const [wsRow] = await sql<{ id: string; name: string }[]>`
		SELECT id, name FROM workspaces WHERE id = ${wsId} LIMIT 1
	`;
	if (!wsRow) error(404, 'Workspace não encontrado');

	const bindings = await listBindings(wsId);

	return { workspace: wsRow, bindings };
};
