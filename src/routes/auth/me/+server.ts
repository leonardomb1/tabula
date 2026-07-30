import { json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ user: null }, { status: 401 });
	return json({
		user: {
			username: locals.user.username,
			displayName: locals.user.displayName,
			mail: locals.user.mail,
			isPlatformAdmin: locals.user.isPlatformAdmin
		},
		workspaces: locals.access?.accessibleWorkspaceIds() ?? []
	});
};
