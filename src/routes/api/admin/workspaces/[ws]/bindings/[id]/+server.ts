import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/server/apiGuards';
import { removeBinding } from '$lib/server/workspaces';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const ws = params.ws!;
	requirePlatformAdmin(locals);
	const id = Number(params.id);
	if (!Number.isInteger(id)) throw error(400, 'invalid binding id');
	const removed = await removeBinding(ws, id);
	if (!removed) throw error(404, 'binding not found');
	return json({ ok: true });
};
