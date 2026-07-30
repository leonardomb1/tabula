/**
 * The attribute vocabulary and matching predicate shared by the access gate and
 * the admin UI, so a rule editor cannot disagree with the enforcer.
 */

export type Role = 'viewer' | 'editor' | 'maintainer';

export const RANK: Record<Role, number> = { viewer: 1, editor: 2, maintainer: 3 };

export const ROLES: Role[] = ['viewer', 'editor', 'maintainer'];

/** Bindable directory attributes: sAMAccountName, memberOf, cost centre, everyone. */
export const ATTR = {
	USER: 'user',
	AD_GROUP: 'ad_group',
	COST_CENTER: 'cost_center',
	WILDCARD: '*'
} as const;

/** Suffix marking an attribute whose value matches the START of a claim value. */
export const PREFIX_SUFFIX = '_prefix';

export const ATTR_PREFIX = {
	AD_GROUP: ATTR.AD_GROUP + PREFIX_SUFFIX,
	COST_CENTER: ATTR.COST_CENTER + PREFIX_SUFFIX
} as const;

/** Attributes offered by the binding editor, with how each value is entered. */
export const BINDABLE_ATTRIBUTES: { key: string; label: string; freeform: boolean }[] = [
	{ key: ATTR.USER, label: 'Person (username)', freeform: true },
	{ key: ATTR.AD_GROUP, label: 'AD group', freeform: true },
	{ key: ATTR_PREFIX.AD_GROUP, label: 'AD group starting with…', freeform: true },
	{ key: ATTR.COST_CENTER, label: 'Cost center code', freeform: true },
	{ key: ATTR_PREFIX.COST_CENTER, label: 'Cost centers starting with…', freeform: true },
	{ key: ATTR.WILDCARD, label: 'Everyone (any authenticated user)', freeform: false }
];

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
