import { json, error } from '@sveltejs/kit';
import { canMaintain } from '$lib/server/workspaces';
import {
	deleteBinding,
	isValidRole,
	isValidSource,
	isValidWsId,
	listBindings,
	upsertBinding,
	type BindingSource
} from '$lib/server/workspacesAdmin';
import type { Role } from '$lib/roles';
import type { RequestHandler } from './$types';

/** Wildcard bindings must have source_value '*'; other sources: non-empty strings up to 512 chars. */
function validBindingValue(source: BindingSource, v: unknown): v is string {
	if (typeof v !== 'string') return false;
	if (source === 'wildcard') return v === '*';
	return v.length > 0 && v.length <= 512;
}

async function parseBinding(request: Request): Promise<{
	source: BindingSource;
	source_value: string;
	role?: Role;
}> {
	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') error(400, 'Corpo JSON inválido');
	const { source, source_value, role } = body as {
		source?: unknown;
		source_value?: unknown;
		role?: unknown;
	};
	if (!isValidSource(source)) error(400, 'source inválido');
	if (!validBindingValue(source, source_value)) error(400, 'source_value inválido');
	if (role !== undefined && !isValidRole(role)) error(400, 'role inválido');
	return { source, source_value, role: role as Role | undefined };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const { ws } = params;
	if (!isValidWsId(ws)) error(400, 'Workspace inválido');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canMaintain(locals.user, ws))) error(403, 'Sem permissão');

	const bindings = await listBindings(ws);
	return json({ bindings });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { ws } = params;
	if (!isValidWsId(ws)) error(400, 'Workspace inválido');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canMaintain(locals.user, ws))) error(403, 'Sem permissão');

	const { source, source_value, role } = await parseBinding(request);
	if (!role) error(400, 'role obrigatório');

	try {
		const { created } = await upsertBinding(locals.user.username, ws, source, source_value, role);
		return json({ ok: true, created }, { status: created ? 201 : 200 });
	} catch (e) {
		if (e instanceof Error && /foreign key|workspaces_/i.test(e.message)) {
			error(404, 'Workspace não encontrado');
		}
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const { ws } = params;
	if (!isValidWsId(ws)) error(400, 'Workspace inválido');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canMaintain(locals.user, ws))) error(403, 'Sem permissão');

	const { source, source_value } = await parseBinding(request);
	const ok = await deleteBinding(locals.user.username, ws, source, source_value);
	if (!ok) error(404, 'Binding não encontrado');
	return json({ ok: true });
};
