/**
 * Display names for the RBAC vocabulary. The keys are stable protocol values, so
 * they stay untranslated in the data and are only mapped to text here.
 */

import * as m from '$lib/paraglide/messages';
import type { Capability } from './policy';

export const attrLabel: Record<string, () => string> = {
	user: m.attr_user,
	ad_group: m.attr_ad_group,
	ad_group_prefix: m.attr_ad_group_prefix,
	cost_center: m.attr_cost_center,
	cost_center_prefix: m.attr_cost_center_prefix,
	'*': m.attr_wildcard
};

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
