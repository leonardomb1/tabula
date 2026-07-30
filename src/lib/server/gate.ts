/**
 * Platform login gate. Allow-rules use the same selector vocabulary as
 * workspace bindings; no rules means everyone authenticated may enter. Blocks
 * are per-user and override everything except platform admin standing.
 */

import { eq, and } from 'drizzle-orm';
import { db } from './db';
import { accessRules, blockedUsers, userSettings, workspaceBindings, apiTokens, type AccessRule } from './db/schema';
import { deleteWorkspace } from './workspaces';
import { personalWorkspaceId } from './ids';
import { ATTR, matchesAny } from '$lib/rbac';

export type GateVerdict = 'ok' | 'blocked' | 'not_allowed';

export async function listGateRules(): Promise<AccessRule[]> {
	return db.select().from(accessRules).orderBy(accessRules.attribute, accessRules.value);
}

export async function addGateRule(attribute: string, value: string): Promise<void> {
	await db
		.insert(accessRules)
		.values({ attribute, value: attribute === ATTR.WILDCARD ? '*' : value })
		.onConflictDoNothing();
}

export async function removeGateRule(id: number): Promise<void> {
	await db.delete(accessRules).where(eq(accessRules.id, id));
}

export async function isBlocked(username: string): Promise<boolean> {
	const [row] = await db
		.select({ username: blockedUsers.username })
		.from(blockedUsers)
		.where(eq(blockedUsers.username, username))
		.limit(1);
	return !!row;
}

export async function blockUser(username: string, actor: string): Promise<void> {
	await db.insert(blockedUsers).values({ username, blockedBy: actor }).onConflictDoNothing();
}

export async function unblockUser(username: string): Promise<void> {
	await db.delete(blockedUsers).where(eq(blockedUsers.username, username));
}

/** Admins always enter; blocks beat rules; no rules at all admits everyone. */
export async function gateVerdict(user: {
	username: string;
	claims: Record<string, string[]>;
	isPlatformAdmin: boolean;
}): Promise<GateVerdict> {
	if (user.isPlatformAdmin) return (await isBlocked(user.username)) ? 'blocked' : 'ok';
	if (await isBlocked(user.username)) return 'blocked';
	const rules = await listGateRules();
	if (rules.length === 0) return 'ok';
	return matchesAny(rules, user.claims) ? 'ok' : 'not_allowed';
}

export interface KnownUser {
	username: string;
	name: string;
	mail: string;
	title: string;
	lastSeenAt: Date | null;
	isPlatformAdmin: boolean;
	blocked: boolean;
}

/** Everyone who has ever signed in (directory snapshot), with block state. */
export async function listKnownUsers(): Promise<KnownUser[]> {
	const rows = await db
		.select({
			username: userSettings.username,
			displayName: userSettings.displayName,
			fullName: userSettings.fullName,
			directoryName: userSettings.directoryName,
			mail: userSettings.mail,
			title: userSettings.title,
			lastSeenAt: userSettings.lastSeenAt,
			isPlatformAdmin: userSettings.isPlatformAdmin,
			blocked: blockedUsers.username
		})
		.from(userSettings)
		.leftJoin(blockedUsers, eq(blockedUsers.username, userSettings.username));
	return rows
		.map((r) => ({
			username: r.username,
			name: r.displayName ?? r.fullName ?? r.directoryName ?? r.username,
			mail: r.mail ?? '',
			title: r.title ?? '',
			lastSeenAt: r.lastSeenAt,
			isPlatformAdmin: r.isPlatformAdmin,
			blocked: r.blocked !== null
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Remove a user's footprint: personal workspace (docs, versions, attachments
 * and bindings cascade), their user-bindings elsewhere, tokens, settings, and
 * any block entry. Storage blobs of their attachments are left behind.
 */
export async function deleteUser(username: string): Promise<void> {
	await deleteWorkspace(personalWorkspaceId(username));
	await db
		.delete(workspaceBindings)
		.where(and(eq(workspaceBindings.attribute, ATTR.USER), eq(workspaceBindings.value, username)));
	await db.delete(apiTokens).where(eq(apiTokens.username, username));
	await db.delete(userSettings).where(eq(userSettings.username, username));
	await db.delete(blockedUsers).where(eq(blockedUsers.username, username));
}
