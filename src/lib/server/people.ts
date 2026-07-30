/**
 * Resolves document authors into the people behind them. Roles come from the claims
 * snapshot taken at that person's last sign-in, run through the same predicate the
 * access gate uses, so the card cannot claim a role they do not have.
 */

import { db } from './db';
import { workspaceBindings } from './db/schema';
import { RANK, matchesSelector, type Role } from '$lib/rbac';
import type { Person } from '$lib/people';
import { directoryRowsFor } from './userSettings';
import { personalWorkspaceId } from './ids';

/** The people behind a set of usernames, with their role in the given workspace. */
export async function getPeople(
	usernames: (string | null)[],
	workspaceId: string
): Promise<Record<string, Person>> {
	const rows = await directoryRowsFor(usernames);
	const people: Record<string, Person> = {};
	if (!rows.length) return people;

	const bindings = await db
		.select({
			workspaceId: workspaceBindings.workspaceId,
			attribute: workspaceBindings.attribute,
			value: workspaceBindings.value,
			role: workspaceBindings.role
		})
		.from(workspaceBindings);

	for (const r of rows) {
		const claims = (r.claims ?? {}) as Record<string, string[]>;

		let here: Role | null = null;
		let maintainsAnything = false;
		for (const b of bindings) {
			if (!matchesSelector({ attribute: b.attribute, value: b.value }, claims)) continue;
			if (b.role === 'maintainer') maintainsAnything = true;
			if (b.workspaceId === workspaceId && (!here || RANK[b.role] > RANK[here])) here = b.role;
		}

		if (workspaceId === personalWorkspaceId(r.username)) here = 'maintainer';

		const role = r.isPlatformAdmin ? 'maintainer' : here;

		people[r.username] = {
			username: r.username,
			name: r.displayName || r.fullName || r.directoryName || r.username,
			mail: r.mail ?? '',
			title: r.title ?? '',
			role,
			crown: r.isPlatformAdmin ? 'gold' : maintainsAnything ? 'silver' : null,
			known: true
		};
	}

	return people;
}

/** Placeholder for an author with no directory row — their login is all we know. */
export function unknownPerson(username: string): Person {
	return { username, name: username, mail: '', title: '', role: null, crown: null, known: false };
}
