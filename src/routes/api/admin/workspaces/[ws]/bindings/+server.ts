import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requirePlatformAdmin, requireRole } from '$lib/server/apiGuards';
import { ATTR, type Role } from '$lib/server/access';
import { listBindings, upsertBinding } from '$lib/server/workspaces';

const ROLES = new Set<Role>(['viewer', 'editor', 'maintainer']);

export const GET: RequestHandler = async ({ locals, params }) => {
	const ws = params.ws!;
	requireRole(locals, ws, 'maintainer');
	return json({ bindings: await listBindings(ws) });
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const ws = params.ws!;
	requirePlatformAdmin(locals);
	const body = (await request.json().catch(() => ({}))) as {
		attribute?: string;
		value?: string;
		role?: Role;
	};

	const attribute = (body.attribute ?? '').trim();
	if (!attribute) throw error(400, 'attribute is required');
	if (!body.role || !ROLES.has(body.role)) throw error(400, 'role must be viewer|editor|maintainer');

	const value = attribute === ATTR.WILDCARD ? '*' : (body.value ?? '').trim();
	if (attribute !== ATTR.WILDCARD && !value) throw error(400, 'value is required');

	const binding = await upsertBinding({ workspaceId: ws, attribute, value, role: body.role });
	return json({ binding }, { status: 201 });
};
