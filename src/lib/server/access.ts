/**
 * Request-scoped authorization: turns a principal's directory claims into a role
 * per workspace by matching them against the workspace bindings.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import { workspaceBindings, workspaces } from './db/schema';
import { personalWorkspaceId } from './ids';
import { ATTR, PREFIX_SUFFIX, RANK, type Role } from '$lib/rbac';

export {
	ATTR,
	ATTR_PREFIX,
	BINDABLE_ATTRIBUTES,
	PREFIX_SUFFIX,
	RANK,
	ROLES,
	matchesAny,
	matchesSelector
} from '$lib/rbac';
export type { Role, Selector } from '$lib/rbac';

/** An authenticated identity: its login, its directory claims, and admin standing. */
export interface Principal {
	username: string;
	claims: Record<string, string[]>;
	isPlatformAdmin: boolean;
}

export interface Access {
	readonly principal: Principal;
	role(workspaceId: string): Role | null;
	can(workspaceId: string, min?: Role): boolean;
	accessibleWorkspaceIds(): string[];
}

/** Resolve a principal's role in every workspace it can reach. */
export async function loadAccess(p: Principal): Promise<Access> {
	const roles = new Map<string, Role>();

	const pairs: { attribute: string; value: string }[] = [];
	for (const [attribute, values] of Object.entries(p.claims)) {
		for (const value of values) pairs.push({ attribute, value });
	}

	const tupleList = sql.join(
		pairs.map((pr) => sql`(${pr.attribute}, ${pr.value})`),
		sql`, `
	);

	const prefixMatch = sql.join(
		pairs.map(
			(pr) =>
				sql`(${workspaceBindings.attribute} = ${pr.attribute + PREFIX_SUFFIX} AND length(${workspaceBindings.value}) > 0 AND starts_with(${pr.value}, ${workspaceBindings.value}))`
		),
		sql` OR `
	);

	const condition = pairs.length
		? sql`${workspaceBindings.attribute} = ${ATTR.WILDCARD} OR (${workspaceBindings.attribute}, ${workspaceBindings.value}) IN (${tupleList}) OR ${prefixMatch}`
		: sql`${workspaceBindings.attribute} = ${ATTR.WILDCARD}`;

	const rows = await db
		.select({ workspaceId: workspaceBindings.workspaceId, role: workspaceBindings.role })
		.from(workspaceBindings)
		.where(condition);

	for (const r of rows) {
		const existing = roles.get(r.workspaceId);
		if (!existing || RANK[r.role] > RANK[existing]) roles.set(r.workspaceId, r.role);
	}

	roles.set(personalWorkspaceId(p.username), 'maintainer');

	let allIds: string[] | null = null;
	if (p.isPlatformAdmin) {
		allIds = (await db.select({ id: workspaces.id }).from(workspaces)).map((w) => w.id);
	}

	const roleOf = (workspaceId: string): Role | null =>
		p.isPlatformAdmin ? 'maintainer' : (roles.get(workspaceId) ?? null);

	return {
		principal: p,
		role: roleOf,
		can(workspaceId, min: Role = 'viewer') {
			const r = roleOf(workspaceId);
			return r !== null && RANK[r] >= RANK[min];
		},
		accessibleWorkspaceIds() {
			if (p.isPlatformAdmin) return [...new Set([...(allIds ?? []), ...roles.keys()])];
			return [...roles.keys()];
		}
	};
}
