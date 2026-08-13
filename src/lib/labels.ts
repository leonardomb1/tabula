/**
 * Display names for the RBAC vocabulary. The keys are stable protocol values, so
 * they stay untranslated in the data and are only mapped to text here.
 */

import * as m from '$lib/paraglide/messages';
import { PREFIX_SUFFIX } from './rbac';
import type { Capability } from './policy';

/**
 * Only the two synthetic attributes and the group claim get written text. Every
 * other attribute is a claim name chosen in the IdP, so it is humanized from the
 * key instead — otherwise mapping a new claim would mean shipping translations
 * before anyone could bind on it.
 */
const named: Record<string, () => string> = {
	user: m.attr_user,
	groups: m.attr_groups,
	'*': m.attr_wildcard
};

function humanize(key: string): string {
	const words = key.replace(/[._-]+/g, ' ').trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function attributeLabel(key: string): string {
	const exact = named[key];
	if (exact) return exact();

	if (key.endsWith(PREFIX_SUFFIX)) {
		const base = key.slice(0, -PREFIX_SUFFIX.length);
		return m.attr_starts_with({ name: named[base]?.() ?? humanize(base) });
	}

	return humanize(key);
}

export const roleLabel: Record<string, () => string> = {
	viewer: m.role_viewer,
	editor: m.role_editor,
	maintainer: m.role_maintainer
};

export const capLabel: Record<Capability, () => string> = {
	create: m.admin_cap_create,
	editAny: m.admin_cap_edit_any,
	deleteOwn: m.admin_cap_delete_own,
	deleteAny: m.admin_cap_delete_any,
	makePublic: m.admin_cap_make_public
};

export function label(map: Record<string, () => string>, key: string): string {
	return map[key]?.() ?? key;
}
