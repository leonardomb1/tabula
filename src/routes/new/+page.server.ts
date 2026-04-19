import { error, redirect } from '@sveltejs/kit';
import { canWrite, getForUser, DEFAULT_WS_ID, PERSONAL_PREFIX } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const user = locals.user;
	if (!user) error(401, 'Não autenticado');

	// Workspace resolution: ?ws=<id>, then cookie, then user's personal.
	let wsId = url.searchParams.get('ws') ?? cookies.get('docs_ws') ?? `${PERSONAL_PREFIX}${user.username}`;
	let ws = await getForUser(user, wsId);
	if (!ws) {
		// Fall back to default if the requested workspace isn't accessible.
		ws = await getForUser(user, DEFAULT_WS_ID);
		if (!ws) error(404, 'Workspace não encontrado');
		wsId = DEFAULT_WS_ID;
	}

	// Write gate — viewers reaching /new (via link, bookmark, direct URL,
	// edit?=<slug>) get bounced to the viewer with a 403 rather than
	// filling out a form and hitting the error at save time.
	if (!(await canWrite(user, wsId))) {
		const editTarget = url.searchParams.get('edit');
		if (editTarget) redirect(302, `/w/${wsId}/${editTarget}`);
		error(403, 'Sem permissão para criar documentos neste workspace');
	}

	// Make the URL canonical (always carry ?ws=) so client-side reads succeed.
	if (url.searchParams.get('ws') !== wsId) {
		const q = new URLSearchParams(url.searchParams);
		q.set('ws', wsId);
		redirect(302, `${url.pathname}?${q}`);
	}

	return { ws };
};
