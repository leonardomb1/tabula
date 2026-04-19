import { error } from '@sveltejs/kit';
import { isPlatformAdmin } from '$lib/server/workspaces';
import { listAllWorkspaces } from '$lib/server/workspacesAdmin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!isPlatformAdmin(locals.user)) error(403, 'Apenas administradores da plataforma');

	const workspaces = await listAllWorkspaces();
	return { workspaces };
};
