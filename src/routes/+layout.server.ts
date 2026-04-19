import type { Cookies } from '@sveltejs/kit';
import { readBranding } from '$lib/branding';
import { listForUser, getForUser, getRole, PERSONAL_PREFIX, type Role, type Workspace } from '$lib/server/workspaces';

export const load = async ({
	locals,
	cookies
}: {
	locals: App.Locals;
	cookies: Cookies;
}) => {
	const branding = readBranding(cookies.get('tabula-theme'));
	const user = locals.user;

	if (!user) return { user: null, branding, workspaces: [], currentWs: null, currentRole: null };

	const workspaces = await listForUser(user);
	const cookieWs = cookies.get('docs_ws');
	let currentWs: Workspace | null = null;
	if (cookieWs) currentWs = await getForUser(user, cookieWs);
	if (!currentWs) currentWs = workspaces.find((w) => w.id === `${PERSONAL_PREFIX}${user.username}`) ?? null;
	if (!currentWs) currentWs = workspaces[0] ?? null;

	const currentRole: Role | null = currentWs ? await getRole(user, currentWs.id) : null;

	return { user, branding, workspaces, currentWs, currentRole };
};
