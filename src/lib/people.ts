/** The person behind a username, as shown on a hover card. */

import type { Role } from './rbac';

export interface Person {
	username: string;
	name: string;
	mail: string;
	title: string;
	role: Role | null;
	crown: 'gold' | 'silver' | null;
	known: boolean;
}

/** Up to two initials, matching the avatars in the sidebar and settings. */
export function initialsOf(name: string): string {
	return (
		name
			.split(/[\s,]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => [...part][0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
}
