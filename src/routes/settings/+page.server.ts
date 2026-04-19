import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** /settings — land on Conta by default. */
export const load: PageServerLoad = async () => {
	redirect(302, '/settings/account');
};
