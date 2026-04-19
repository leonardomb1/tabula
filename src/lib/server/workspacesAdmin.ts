/**
 * Write-path for workspace admin operations. Endpoints stay thin: they
 * parse + authorize, then call into here. Audit rows are emitted from
 * this layer so every mutation is accounted for, regardless of which
 * HTTP surface triggered it.
 *
 * Read helpers still live in `./workspaces` (listForUser, getRole, …)
 * — split kept intentional: read-paths don't need the audit noise and
 * callers shouldn't accidentally import a write helper.
 */
import { sql } from './db';
import { audit } from './audit';
import { DEFAULT_WS_ID } from './workspaces';
import { ROLES, type Role } from '../roles';

export type BindingSource = 'user' | 'wildcard' | 'ldap_group' | 'oidc_claim';

export const WS_ID_RE = /^[a-z0-9-]+$/;
const VALID_SOURCES: readonly BindingSource[] = ['user', 'wildcard', 'ldap_group', 'oidc_claim'];
const VALID_ROLES: readonly Role[] = [ROLES.VIEWER, ROLES.EDITOR, ROLES.MAINTAINER];

export function isValidWsId(s: unknown): s is string {
	return typeof s === 'string' && WS_ID_RE.test(s) && s.length >= 2 && s.length <= 64;
}
export function isValidSource(s: unknown): s is BindingSource {
	return typeof s === 'string' && (VALID_SOURCES as readonly string[]).includes(s);
}
export function isValidRole(s: unknown): s is Role {
	return typeof s === 'string' && (VALID_ROLES as readonly string[]).includes(s);
}

export interface Binding {
	source: BindingSource;
	source_value: string;
	role: Role;
	created_at: Date;
	created_by: string | null;
}

export interface WorkspaceRow {
	id: string;
	name: string;
	settings: Record<string, unknown>;
	created_at: Date;
	updated_at: Date;
}

export async function listAllWorkspaces(): Promise<WorkspaceRow[]> {
	return sql<WorkspaceRow[]>`
		SELECT id, name, settings, created_at, updated_at
		FROM workspaces
		ORDER BY name
	`;
}

export async function createWorkspace(actor: string, id: string, name: string): Promise<WorkspaceRow> {
	const rows = await sql<WorkspaceRow[]>`
		INSERT INTO workspaces (id, name)
		VALUES (${id}, ${name})
		RETURNING id, name, settings, created_at, updated_at
	`;
	await audit({ actor, action: 'workspace.create', target: id, meta: { name } });
	return rows[0];
}

export async function renameWorkspace(actor: string, id: string, name: string): Promise<WorkspaceRow | null> {
	const rows = await sql<WorkspaceRow[]>`
		UPDATE workspaces
		SET name = ${name}, updated_at = now()
		WHERE id = ${id}
		RETURNING id, name, settings, created_at, updated_at
	`;
	if (rows.length === 0) return null;
	await audit({ actor, action: 'workspace.rename', target: id, meta: { name } });
	return rows[0];
}

export async function deleteWorkspace(actor: string, id: string): Promise<boolean> {
	if (id === DEFAULT_WS_ID) {
		throw new Error(`Cannot delete the default workspace (${DEFAULT_WS_ID})`);
	}
	const rows = await sql<{ id: string }[]>`
		DELETE FROM workspaces WHERE id = ${id} RETURNING id
	`;
	if (rows.length === 0) return false;
	await audit({ actor, action: 'workspace.delete', target: id });
	return true;
}

export async function listBindings(wsId: string): Promise<Binding[]> {
	return sql<Binding[]>`
		SELECT source, source_value, role, created_at, created_by
		FROM workspace_bindings
		WHERE workspace_id = ${wsId}
		ORDER BY source, source_value
	`;
}

/**
 * Upsert a binding. If one already exists for (ws, source, source_value),
 * the role is updated. Audit action reflects whether we inserted or
 * changed the role.
 */
export async function upsertBinding(
	actor: string,
	wsId: string,
	source: BindingSource,
	sourceValue: string,
	role: Role
): Promise<{ created: boolean }> {
	const existing = await sql<{ role: Role }[]>`
		SELECT role FROM workspace_bindings
		WHERE workspace_id = ${wsId} AND source = ${source} AND source_value = ${sourceValue}
		LIMIT 1
	`;
	const created = existing.length === 0;
	const prevRole = existing[0]?.role ?? null;

	await sql`
		INSERT INTO workspace_bindings (workspace_id, source, source_value, role, created_by)
		VALUES (${wsId}, ${source}, ${sourceValue}, ${role}::workspace_role, ${actor})
		ON CONFLICT (workspace_id, source, source_value)
		DO UPDATE SET role = EXCLUDED.role
	`;

	await audit({
		actor,
		action: created ? 'binding.add' : 'binding.update',
		target: wsId,
		meta: { source, source_value: sourceValue, role, prevRole }
	});

	return { created };
}

export async function deleteBinding(
	actor: string,
	wsId: string,
	source: BindingSource,
	sourceValue: string
): Promise<boolean> {
	const rows = await sql<{ role: Role }[]>`
		DELETE FROM workspace_bindings
		WHERE workspace_id = ${wsId} AND source = ${source} AND source_value = ${sourceValue}
		RETURNING role
	`;
	if (rows.length === 0) return false;
	await audit({
		actor,
		action: 'binding.remove',
		target: wsId,
		meta: { source, source_value: sourceValue, role: rows[0].role }
	});
	return true;
}
