/**
 * Shared role vocabulary. Lives in `$lib/` (not `$lib/server/`) so both
 * server modules (`workspaces.ts`, auth gates) and client components
 * (viewer, home page) can import the same names and avoid string-
 * literal drift.
 *
 * Order encodes the ranking: viewer < editor < maintainer. If you add a
 * role, append it in rank order and keep the Postgres enum in
 * `workspace_role` matching exactly.
 */
export const ROLES = {
	VIEWER: 'viewer',
	EDITOR: 'editor',
	MAINTAINER: 'maintainer'
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const ORDER: readonly Role[] = [ROLES.VIEWER, ROLES.EDITOR, ROLES.MAINTAINER];

/**
 * True if `role` is at least as strong as `min`. Examples:
 *   isAtLeast('editor',     'viewer')      // true
 *   isAtLeast('viewer',     'editor')      // false
 *   isAtLeast('maintainer', 'editor')      // true
 */
export function isAtLeast(role: Role | null | undefined, min: Role): boolean {
	if (!role) return false;
	return ORDER.indexOf(role) >= ORDER.indexOf(min);
}
