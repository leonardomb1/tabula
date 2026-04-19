import { redirect } from '@sveltejs/kit';
import { isPlatformAdmin } from '$lib/server/workspaces';
import type { LayoutServerLoad } from './$types';

/**
 * Settings gate. Any authed user can see the shell (so they at least
 * get to Conta and their workspace list). The individual sections
 * that require elevated roles guard themselves.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/login?redirect=/settings');
	return {
		isPlatformAdmin: isPlatformAdmin(locals.user)
	};
};
