import { error } from '@sveltejs/kit';
import { getRole, listForUser, PERSONAL_PREFIX } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) error(401, 'Autenticação obrigatória');
	const user = locals.user;

	const all = await listForUser(user);
	// Hide personal workspaces — there's no multi-user admin surface for
	// the owner-only space. Pair each team with its resolved role.
	const teams = all.filter((w) => !w.id.startsWith(PERSONAL_PREFIX));
	const withRoles = await Promise.all(
		teams.map(async (w) => ({ ...w, role: await getRole(user, w.id) }))
	);

	return { workspaces: withRoles };
};
