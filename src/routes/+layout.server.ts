import type { Cookies } from '@sveltejs/kit';
import { readBranding } from '$lib/branding';
import { listForUser, getForUser, PERSONAL_PREFIX, type Workspace } from '$lib/server/workspaces';

export const load = async ({
	locals,
	cookies
}: {
	locals: App.Locals;
	cookies: Cookies;
}) => {
	const branding = readBranding();
	const username = locals.user?.username;

	if (!username) return { user: null, branding, workspaces: [], currentWs: null };

	const workspaces = await listForUser(username);
	const cookieWs = cookies.get('docs_ws');
	let currentWs: Workspace | null = null;
	if (cookieWs) currentWs = await getForUser(username, cookieWs);
	if (!currentWs) currentWs = workspaces.find((w) => w.id === `${PERSONAL_PREFIX}${username}`) ?? null;
	if (!currentWs) currentWs = workspaces[0] ?? null;

	return { user: locals.user, branding, workspaces, currentWs };
};
