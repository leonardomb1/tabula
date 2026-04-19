/**
 * Workspaces — admin-defined teams + auto-created personal spaces.
 *
 * Source of truth is Postgres:
 *   `workspaces`          — team metadata
 *   `workspace_bindings`  — role grants, keyed by (source, source_value)
 *
 * Personal workspaces are implicit per logged-in user (never stored);
 * the user is always maintainer of their own personal space.
 *
 * Role model, per workspace: 'viewer' < 'editor' < 'maintainer'. Enum
 * order in Postgres matches this, so `max(role)` across a user's
 * bindings resolves their effective role.
 *
 * Platform super-user is a session-level attribute (`isPlatformAdmin`),
 * sourced from LDAP/OIDC groups or the break-glass admin user — never
 * from a binding. It bypasses every gate below.
 */
import { sql } from './db';
import type { SessionInfo } from './auth';
import { ROLES, isAtLeast, type Role } from '../roles';

export { ROLES, type Role };

export const DEFAULT_WS_ID = 'default';
export const PERSONAL_PREFIX = 'personal-';

export interface Workspace {
	id: string;
	name: string;
	kind: 'team' | 'personal';
}

/**
 * Accepts either the full `SessionInfo` (preferred — carries groups and
 * the platform-admin flag) or just a username string for call sites that
 * don't have the session in scope yet. Username-only callers miss group
 * bindings and never satisfy `isPlatformAdmin`.
 */
type UserRef = SessionInfo | string;

function toRef(u: UserRef): SessionInfo {
	return typeof u === 'string' ? { username: u, displayName: u } : u;
}

function personalWsForUser(username: string): Workspace {
	return { id: `${PERSONAL_PREFIX}${username}`, name: 'Pessoal', kind: 'personal' };
}

/**
 * Predicate clause that matches all bindings the given user qualifies for.
 * Group arrays are passed through `sql.array(..., 'TEXT')` so commas inside
 * DN values (e.g. `cn=x,ou=y`) don't get reinterpreted as array separators.
 */
function userBindingMatch(u: SessionInfo) {
	const ldap = sql.array(u.ldapGroups ?? [], 'TEXT');
	const oidc = sql.array(u.oidcGroups ?? [], 'TEXT');
	return sql`
		(b.source = 'user'       AND b.source_value = ${u.username})
		OR (b.source = 'wildcard' AND b.source_value = '*')
		OR (b.source = 'ldap_group' AND b.source_value = ANY(${ldap}))
		OR (b.source = 'oidc_claim' AND b.source_value = ANY(${oidc}))
	`;
}

/** All workspaces the user can see. Platform admins see every team workspace. */
export async function listForUser(u: UserRef): Promise<Workspace[]> {
	const info = toRef(u);
	const rows = info.isPlatformAdmin
		? await sql<{ id: string; name: string }[]>`
				SELECT w.id, w.name FROM workspaces w ORDER BY w.name
			`
		: await sql<{ id: string; name: string }[]>`
				SELECT DISTINCT w.id, w.name
				FROM workspaces w
				JOIN workspace_bindings b ON b.workspace_id = w.id
				WHERE ${userBindingMatch(info)}
				ORDER BY w.name
			`;

	return [
		personalWsForUser(info.username),
		...rows.map((r) => ({ id: r.id, name: r.name, kind: 'team' as const }))
	];
}

/** Look up a single workspace by id, scoped to what the user can access. */
export async function getForUser(u: UserRef, wsId: string): Promise<Workspace | null> {
	const info = toRef(u);
	if (wsId.startsWith(PERSONAL_PREFIX)) {
		return wsId === `${PERSONAL_PREFIX}${info.username}` ? personalWsForUser(info.username) : null;
	}

	if (info.isPlatformAdmin) {
		const rows = await sql<{ name: string }[]>`
			SELECT name FROM workspaces WHERE id = ${wsId} LIMIT 1
		`;
		return rows.length === 0 ? null : { id: wsId, name: rows[0].name, kind: 'team' };
	}

	const rows = await sql<{ name: string }[]>`
		SELECT w.name
		FROM workspaces w
		WHERE w.id = ${wsId}
		  AND EXISTS (
		    SELECT 1 FROM workspace_bindings b
		    WHERE b.workspace_id = w.id AND (${userBindingMatch(info)})
		  )
		LIMIT 1
	`;

	if (rows.length === 0) return null;
	return { id: wsId, name: rows[0].name, kind: 'team' };
}

/**
 * Effective role on `wsId`. Platform admins always resolve to maintainer;
 * personal-workspace owners are maintainer of their own; everyone else
 * is the max role across their matching bindings.
 */
export async function getRole(u: UserRef, wsId: string): Promise<Role | null> {
	const info = toRef(u);

	if (info.isPlatformAdmin) return ROLES.MAINTAINER;

	if (wsId.startsWith(PERSONAL_PREFIX)) {
		return wsId === `${PERSONAL_PREFIX}${info.username}` ? ROLES.MAINTAINER : null;
	}

	const rows = await sql<{ role: Role }[]>`
		SELECT max(b.role)::text AS role
		FROM workspace_bindings b
		WHERE b.workspace_id = ${wsId} AND (${userBindingMatch(info)})
	`;

	return rows[0]?.role ?? null;
}

export async function canAccess(u: UserRef, wsId: string): Promise<boolean> {
	return (await getRole(u, wsId)) !== null;
}

/** Write gate: editor or maintainer can mutate. Viewers get read-only access. */
export async function canWrite(u: UserRef, wsId: string): Promise<boolean> {
	return isAtLeast(await getRole(u, wsId), ROLES.EDITOR);
}

/**
 * Maintain gate: manage workspace settings, bindings, rename, delete.
 * Platform admins always qualify (via getRole returning 'maintainer').
 */
export async function canMaintain(u: UserRef, wsId: string): Promise<boolean> {
	return isAtLeast(await getRole(u, wsId), ROLES.MAINTAINER);
}

/** Platform-admin short-circuit. True for break-glass admin and configured platform-admin groups. */
export function isPlatformAdmin(u: UserRef): boolean {
	return toRef(u).isPlatformAdmin === true;
}

/** Storage prefix for a workspace's docs/attachments/history. */
export function wsPrefix(wsId: string): string {
	return `content/workspaces/${wsId}/`;
}
