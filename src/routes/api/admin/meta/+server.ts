import { json, type RequestHandler } from '@sveltejs/kit';
import { BINDABLE_ATTRIBUTES } from '$lib/server/access';
import { requireUser } from '$lib/server/apiGuards';

export const GET: RequestHandler = async ({ locals }) => {
	requireUser(locals);
	return json({ attributes: BINDABLE_ATTRIBUTES, roles: ['viewer', 'editor', 'maintainer'] });
};
