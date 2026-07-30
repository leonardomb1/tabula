import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requirePlatformAdmin, requireUser } from '$lib/server/apiGuards';
import { createWorkspace, listWorkspaces, WorkspaceExistsError } from '$lib/server/workspaces';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const RESERVED = new Set(['default']);

export const GET: RequestHandler = async ({ locals }) => {
	const { access } = requireUser(locals);
	const all = await listWorkspaces();
	return json({ workspaces: all.filter((w) => access.can(w.id, 'maintainer')) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = requirePlatformAdmin(locals);
	const body = (await request.json().catch(() => ({}))) as { id?: string; name?: string };

	const id = (body.id ?? '').trim().toLowerCase();
	if (!ID_RE.test(id) || id.startsWith('personal-') || RESERVED.has(id)) {
		throw error(400, 'invalid workspace id (lowercase slug, not reserved)');
	}
	if (!body.name?.trim()) throw error(400, 'name is required');

	try {
		const ws = await createWorkspace(id, body.name.trim(), 'team', user.username);
		return json({ workspace: ws }, { status: 201 });
	} catch (e) {
		if (e instanceof WorkspaceExistsError) throw error(409, 'workspace already exists');
		throw e;
	}
};
