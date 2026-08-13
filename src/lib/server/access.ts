/**
 * Request-scoped authorization: turns a principal's directory claims into a role
 * per workspace by matching them against the workspace bindings.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';
import { userSettings, workspaceBindings, workspaces } from './db/schema';
import { personalWorkspaceId } from './ids';
import { ATTR, PREFIX_SUFFIX, RANK, SYNTHETIC_ATTRIBUTES, type Role } from '$lib/rbac';

export {
	ATTR,
	PREFIX_SUFFIX,
	RANK,
	ROLES,
	SYNTHETIC_ATTRIBUTES,
	matchesAny,
	matchesSelector
} from '$lib/rbac';
export type { Role, Selector } from '$lib/rbac';

export interface BindableAttribute {
	key: string;
	/** False for the wildcard, which takes no value. */
	freeform: boolean;
}

/**
 * What the binding editor offers. Since an attribute is just a claim name, the
 * list is whatever the IdP has actually sent — read back off the sign-in
 * snapshots — rather than a constant somebody has to remember to extend.
 *
 * ponytail: reads every snapshot row to union their keys. Fine at directory
 * scale; if user_settings ever gets big, swap in `jsonb_object_keys` server-side.
 */
export async function bindableAttributes(): Promise<BindableAttribute[]> {
	const rows = await db.select({ claims: userSettings.claims }).from(userSettings);

	const seen = new Set<string>();
	for (const row of rows) for (const key of Object.keys(row.claims)) seen.add(key);

	// Offered even before anyone has signed in, so a fresh install can be set up.
	seen.add(ATTR.USER);
	seen.add(ATTR.GROUPS);

	const first: string[] = [ATTR.USER, ATTR.GROUPS];
	const rest = [...seen].filter((k) => !first.includes(k)).sort();

	const attributes: BindableAttribute[] = [];
	for (const key of [...first, ...rest]) {
		attributes.push({ key, freeform: true });
		// Every real claim can also be matched on a leading fragment; the
		// synthetic ones cannot, having no value space to walk.
		if (!SYNTHETIC_ATTRIBUTES.includes(key)) {
			attributes.push({ key: key + PREFIX_SUFFIX, freeform: true });
		}
	}
	attributes.push({ key: ATTR.WILDCARD, freeform: false });

	return attributes;
}

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

	// Admin standing never reaches into someone else's personal workspace.
	const foreignPersonal = (id: string) =>
		id.startsWith('personal-') && id !== personalWorkspaceId(p.username);

	let allIds: string[] | null = null;
	if (p.isPlatformAdmin) {
		allIds = (await db.select({ id: workspaces.id }).from(workspaces))
			.map((w) => w.id)
			.filter((id) => !foreignPersonal(id));
	}

	const roleOf = (workspaceId: string): Role | null =>
		p.isPlatformAdmin && !foreignPersonal(workspaceId)
			? 'maintainer'
			: (roles.get(workspaceId) ?? null);

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
