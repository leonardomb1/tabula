/**
 * The attribute vocabulary and matching predicate shared by the access gate and
 * the admin UI, so a rule editor cannot disagree with the enforcer.
 *
 * An attribute IS an ID token claim name. There is no fixed list: whatever the
 * IdP maps into the token becomes bindable, so adding `department` to a property
 * mapping is the whole change — no constant, no migration, no deploy. The two
 * exceptions below are synthetic, because no claim can supply them.
 */

export type Role = 'viewer' | 'editor' | 'maintainer';

export const RANK: Record<Role, number> = { viewer: 1, editor: 2, maintainer: 3 };

export const ROLES: Role[] = ['viewer', 'editor', 'maintainer'];

export const ATTR = {
	/** Synthetic: the resolved username, whichever claim it was read from. */
	USER: 'user',
	/** Not synthetic — the conventional OIDC claim — but named for admin checks. */
	GROUPS: 'groups',
	/** Synthetic: matches every signed-in principal. */
	WILDCARD: '*'
} as const;

/** Attributes that name no claim, so they never appear in a token. */
export const SYNTHETIC_ATTRIBUTES: string[] = [ATTR.USER, ATTR.WILDCARD];

/** Suffix marking an attribute whose value matches the START of a claim value. */
export const PREFIX_SUFFIX = '_prefix';

/** One membership or approval rule: which attribute to match, and on what value. */
export interface Selector {
	attribute: string;
	value: string;
}

/** Whether a claims map satisfies one selector. An empty prefix never matches. */
export function matchesSelector(sel: Selector, claims: Record<string, string[]>): boolean {
	if (sel.attribute === ATTR.WILDCARD) return true;

	if (sel.attribute.endsWith(PREFIX_SUFFIX)) {
		if (!sel.value) return false;
		const base = sel.attribute.slice(0, -PREFIX_SUFFIX.length);
		return (claims[base] ?? []).some((v) => v.startsWith(sel.value));
	}

	return (claims[sel.attribute] ?? []).includes(sel.value);
}

/** True when any selector matches — the OR semantics used throughout. */
export function matchesAny(selectors: Selector[], claims: Record<string, string[]>): boolean {
	return selectors.some((s) => matchesSelector(s, claims));
}
