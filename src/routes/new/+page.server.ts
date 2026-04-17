import { error, redirect } from '@sveltejs/kit';
import { getForUser, DEFAULT_WS_ID, PERSONAL_PREFIX } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const username = locals.user?.username;
	if (!username) error(401, 'Não autenticado');

	// Workspace resolution: ?ws=<id>, then cookie, then user's personal.
	let wsId = url.searchParams.get('ws') ?? cookies.get('docs_ws') ?? `${PERSONAL_PREFIX}${username}`;
	let ws = await getForUser(username, wsId);
	if (!ws) {
		// Fall back to default if the requested workspace isn't accessible.
		ws = await getForUser(username, DEFAULT_WS_ID);
		if (!ws) error(404, 'Workspace não encontrado');
		wsId = DEFAULT_WS_ID;
	}

	// Make the URL canonical (always carry ?ws=) so client-side reads succeed.
	if (url.searchParams.get('ws') !== wsId) {
		const q = new URLSearchParams(url.searchParams);
		q.set('ws', wsId);
		redirect(302, `${url.pathname}?${q}`);
	}

	return { ws };
};
