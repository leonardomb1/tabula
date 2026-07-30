import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requirePlatformAdmin, requireRole } from '$lib/server/apiGuards';
import { quorumDeadlocks, sanitizePolicy } from '$lib/policy';
import {
	deleteWorkspace,
	getPolicy,
	getWorkspace,
	listBindings,
	updatePolicy,
	updateWorkspace
} from '$lib/server/workspaces';

export const GET: RequestHandler = async ({ locals, params }) => {
	const ws = params.ws!;
	requireRole(locals, ws, 'maintainer');
	const workspace = await getWorkspace(ws);
	if (!workspace) throw error(404, 'workspace not found');
	return json({
		workspace,
		bindings: await listBindings(ws),
		policy: sanitizePolicy(workspace.policy)
	});
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const ws = params.ws!;
	requireRole(locals, ws, 'maintainer');
	const body = (await request.json().catch(() => ({}))) as { name?: string; policy?: unknown };

	if (body.name !== undefined) {
		if (!body.name.trim()) throw error(400, 'name must not be empty');
		const renamed = await updateWorkspace(ws, body.name.trim());
		if (!renamed) throw error(404, 'workspace not found');
	}

	if (body.policy !== undefined) {
		const candidate = sanitizePolicy(body.policy);
		const maintainers = (await listBindings(ws))
			.filter((b) => b.role === 'maintainer')
			.map((b) => ({ attribute: b.attribute, value: b.value }));
		if (quorumDeadlocks(candidate, maintainers)) {
			throw error(400, 'quorum exceeds the number of approvers it can ever have');
		}
		if (!(await updatePolicy(ws, candidate))) throw error(404, 'workspace not found');
	}

	const workspace = await getWorkspace(ws);
	if (!workspace) throw error(404, 'workspace not found');
	return json({ workspace, policy: await getPolicy(ws) });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const ws = params.ws!;
	requirePlatformAdmin(locals);
	const workspace = await getWorkspace(ws);
	if (!workspace) throw error(404, 'workspace not found');
	if (workspace.kind === 'system' || ws.startsWith('personal-')) {
		throw error(403, 'system and personal workspaces cannot be deleted');
	}
	await deleteWorkspace(ws);
	return json({ ok: true });
};
