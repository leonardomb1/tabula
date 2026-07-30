import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { revokeToken } from '$lib/server/tokens';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const { user } = requireUser(locals);
	const revoked = await revokeToken(user.username, params.id ?? '');
	if (!revoked) throw error(404, 'token not found');
	return json({ ok: true });
};
