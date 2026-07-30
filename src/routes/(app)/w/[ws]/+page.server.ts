import { error } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { loadIndexData } from '$lib/server/docsQuery';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.access?.can(params.ws)) error(403);
	const workspace = await getWorkspace(params.ws);
	if (!workspace) error(404);

	return {
		workspace,
		...(await loadIndexData(params.ws, url)),
		canWrite: locals.access.can(params.ws, 'editor')
	};
};
