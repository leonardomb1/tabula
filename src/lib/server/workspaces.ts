/** Workspaces, their membership bindings, and their internal policy. */

import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { workspaceBindings, workspaces, type Workspace, type WorkspaceBinding } from './db/schema';
import { sanitizePolicy, type WorkspacePolicy } from '$lib/policy';
import type { Role } from './access';

export type WorkspaceKind = 'system' | 'team' | 'personal';

export class WorkspaceExistsError extends Error {
	constructor(id: string) {
		super(`workspace already exists: ${id}`);
		this.name = 'WorkspaceExistsError';
	}
}

/** Upsert a workspace, for seeding known ones. */
export async function ensureWorkspace(
	id: string,
	name?: string,
	kind: WorkspaceKind = 'team'
): Promise<Workspace> {
	const [ws] = await db
		.insert(workspaces)
		.values({ id, name: name ?? id, kind })
		.onConflictDoUpdate({ target: workspaces.id, set: { name: name ?? id } })
		.returning();
	return ws;
}

/** Create a workspace and make the creator its maintainer, atomically. */
export async function createWorkspace(
	id: string,
	name: string,
	kind: WorkspaceKind,
	creatorUsername: string
): Promise<Workspace> {
	return db.transaction(async (tx) => {
		const [ws] = await tx
			.insert(workspaces)
			.values({ id, name: name || id, kind })
			.onConflictDoNothing()
			.returning();
		if (!ws) throw new WorkspaceExistsError(id);
		await tx.insert(workspaceBindings).values({
			workspaceId: id,
			attribute: 'user',
			value: creatorUsername,
			role: 'maintainer'
		});
		return ws;
	});
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
	const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
	return ws ?? null;
}

export async function listWorkspaces(): Promise<Workspace[]> {
	return db.select().from(workspaces);
}

export async function updateWorkspace(id: string, name: string): Promise<Workspace | null> {
	const [ws] = await db.update(workspaces).set({ name }).where(eq(workspaces.id, id)).returning();
	return ws ?? null;
}

/** Delete a workspace; cascades to its bindings, docs, versions and attachments. */
export async function deleteWorkspace(id: string): Promise<boolean> {
	const rows = await db.delete(workspaces).where(eq(workspaces.id, id)).returning({ id: workspaces.id });
	return rows.length > 0;
}

/** The workspace's internal rules, with every gap filled from DEFAULT_POLICY. */
export async function getPolicy(id: string): Promise<WorkspacePolicy> {
	const [row] = await db
		.select({ policy: workspaces.policy })
		.from(workspaces)
		.where(eq(workspaces.id, id))
		.limit(1);
	return sanitizePolicy(row?.policy);
}

/** Persist a policy, sanitized here too so a direct API call cannot store junk. */
export async function updatePolicy(
	id: string,
	policy: unknown
): Promise<WorkspacePolicy | null> {
	const clean = sanitizePolicy(policy);
	const [row] = await db
		.update(workspaces)
		.set({ policy: clean })
		.where(eq(workspaces.id, id))
		.returning({ policy: workspaces.policy });
	return row ? sanitizePolicy(row.policy) : null;
}

export interface BindingInput {
	workspaceId: string;
	attribute: string;
	value?: string;
	role: Role;
}

/** Create or re-role a membership rule; unique on (workspace, attribute, value). */
export async function upsertBinding(input: BindingInput): Promise<WorkspaceBinding> {
	const value = input.value ?? '*';
	const [row] = await db
		.insert(workspaceBindings)
		.values({ workspaceId: input.workspaceId, attribute: input.attribute, value, role: input.role })
		.onConflictDoUpdate({
			target: [
				workspaceBindings.workspaceId,
				workspaceBindings.attribute,
				workspaceBindings.value
			],
			set: { role: input.role }
		})
		.returning();
	return row;
}

/** Remove a binding, scoped to its workspace so a foreign id cannot be deleted. */
export async function removeBinding(workspaceId: string, id: number): Promise<boolean> {
	const rows = await db
		.delete(workspaceBindings)
		.where(and(eq(workspaceBindings.id, id), eq(workspaceBindings.workspaceId, workspaceId)))
		.returning({ id: workspaceBindings.id });
	return rows.length > 0;
}

export async function listBindings(workspaceId: string): Promise<WorkspaceBinding[]> {
	return db
		.select()
		.from(workspaceBindings)
		.where(eq(workspaceBindings.workspaceId, workspaceId));
}
