import { json, type RequestHandler } from '@sveltejs/kit';
import { bindableAttributes } from '$lib/server/access';
import { requireUser } from '$lib/server/apiGuards';

export const GET: RequestHandler = async ({ locals }) => {
	requireUser(locals);
	return json({ attributes: await bindableAttributes(), roles: ['viewer', 'editor', 'maintainer'] });
};
