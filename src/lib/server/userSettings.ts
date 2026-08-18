/**
 * Per-user state: the name someone chose for themselves, plus a snapshot of what
 * the directory said at their last sign-in. The snapshot exists so the app can
 * describe someone who is not the current user; it lags by up to one login.
 */

import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { userSettings, type UserSettings } from './db/schema';

export interface ProfilePatch {
	fullName?: string;
	displayName?: string;
	onboarded?: boolean;
}

/** One person's row, or null when they have never signed in. */
export async function getUserSettings(username: string): Promise<UserSettings | null> {
	const [row] = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.username, username))
		.limit(1);
	return row ?? null;
}

/** Upsert; only the keys present in `patch` are written. */
export async function saveUserSettings(
	username: string,
	patch: ProfilePatch
): Promise<UserSettings> {
	const values = {
		...(patch.fullName !== undefined ? { fullName: patch.fullName.trim() || null } : {}),
		...(patch.displayName !== undefined ? { displayName: patch.displayName.trim() || null } : {}),
		...(patch.onboarded !== undefined ? { onboarded: patch.onboarded } : {})
	};

	const [row] = await db
		.insert(userSettings)
		.values({ username, ...values })
		.onConflictDoUpdate({
			target: userSettings.username,
			set: { ...values, updatedAt: new Date() }
		})
		.returning();
	return row;
}

/** What the UI should call someone: their choice, then the directory, then the login. */
export function preferredName(
	settings: UserSettings | null,
	directoryName: string | undefined,
	username: string
): string {
	return settings?.displayName || directoryName || username;
}

/** Record what the directory said at sign-in, never touching self-chosen fields. */
export async function recordDirectorySnapshot(user: {
	username: string;
	displayName?: string;
	mail?: string;
	title?: string;
	claims: Record<string, string[]>;
	isPlatformAdmin: boolean;
}): Promise<void> {
	const snapshot = {
		mail: user.mail ?? null,
		title: user.title ?? null,
		directoryName: user.displayName ?? null,
		claims: user.claims,
		isPlatformAdmin: user.isPlatformAdmin,
		lastSeenAt: new Date()
	};
	await db
		.insert(userSettings)
		.values({ username: user.username, ...snapshot })
		.onConflictDoUpdate({ target: userSettings.username, set: snapshot });
}

/** The claims recorded at the last sign-in; null when nobody by that name has signed in. */
export async function directoryClaimsFor(
	username: string
): Promise<Record<string, string[]> | null> {
	const [row] = await db
		.select({ claims: userSettings.claims })
		.from(userSettings)
		.where(eq(userSettings.username, username))
		.limit(1);
	return row ? (row.claims as Record<string, string[]>) : null;
}

/** The rows behind a set of usernames, in one query. */
export async function directoryRowsFor(usernames: (string | null)[]) {
	const wanted = [...new Set(usernames.filter((u): u is string => Boolean(u)))];
	if (!wanted.length) return [];
	return db
		.select({
			username: userSettings.username,
			displayName: userSettings.displayName,
			fullName: userSettings.fullName,
			directoryName: userSettings.directoryName,
			mail: userSettings.mail,
			title: userSettings.title,
			claims: userSettings.claims,
			isPlatformAdmin: userSettings.isPlatformAdmin
		})
		.from(userSettings)
		.where(inArray(userSettings.username, wanted));
}

/** Display names for a set of authors: preferred, then onboarding, then directory. */
export async function displayNamesFor(usernames: (string | null)[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	for (const r of await directoryRowsFor(usernames)) {
		const name = r.displayName || r.fullName || r.directoryName;
		if (name) names.set(r.username, name);
	}
	return names;
}

/** The name to print for one author, falling back to their login. */
export function nameOf(names: Map<string, string>, username: string | null): string {
	return username ? (names.get(username) ?? username) : '';
}

/** The name for a signed document: full name first, preferred name last. */
export async function formalNameFor(username: string | null): Promise<string> {
	if (!username) return '';
	const [row] = await directoryRowsFor([username]);
	if (!row) return username;
	return row.fullName || row.directoryName || row.displayName || username;
}
