import { error } from '@sveltejs/kit';
import type { Access, Role } from './access';
import type { SessionUser } from './auth';

export function requireUser(locals: App.Locals): { user: SessionUser; access: Access } {
	if (!locals.user || !locals.access) throw error(401, 'authentication required');
	return { user: locals.user, access: locals.access };
}

export function requireRole(
	locals: App.Locals,
	workspaceId: string,
	min: Role
): { user: SessionUser; access: Access } {
	const ctx = requireUser(locals);
	if (!ctx.access.can(workspaceId, min)) throw error(403, `requires ${min} on ${workspaceId}`);
	return ctx;
}

export function requirePlatformAdmin(locals: App.Locals): { user: SessionUser; access: Access } {
	const ctx = requireUser(locals);
	if (!ctx.user.isPlatformAdmin) throw error(403, 'platform admin required');
	return ctx;
}
