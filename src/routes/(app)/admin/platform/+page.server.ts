import { error, fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { ATTR, BINDABLE_ATTRIBUTES } from '$lib/server/access';
import {
	addGateRule,
	blockUser,
	deleteUser,
	listGateRules,
	listKnownUsers,
	removeGateRule,
	unblockUser
} from '$lib/server/gate';
import type { Actions, PageServerLoad } from './$types';

function requireCentral(locals: App.Locals) {
	const ctx = requireUser(locals);
	if (!ctx.user.isPlatformAdmin) throw error(403, 'platform admin required');
	return ctx;
}

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = requireCentral(locals);
	const [rules, users] = await Promise.all([listGateRules(), listKnownUsers()]);
	return {
		rules: rules.map((r) => ({ id: r.id, attribute: r.attribute, value: r.value })),
		users: users.map((u) => ({ ...u, lastSeenAt: u.lastSeenAt?.toISOString() ?? null })),
		attributes: BINDABLE_ATTRIBUTES,
		you: user.username
	};
};

/** A platform admin can never be blocked or deleted, and neither can yourself. */
async function guardTarget(locals: App.Locals, username: string) {
	const { user } = requireCentral(locals);
	if (!username) return fail(400, { error: 'bad_user' });
	if (username === user.username) return fail(400, { error: 'self' });
	const target = (await listKnownUsers()).find((u) => u.username === username);
	if (target?.isPlatformAdmin) return fail(403, { error: 'admin_target' });
	return { user };
}

export const actions: Actions = {
	addRule: async ({ request, locals }) => {
		requireCentral(locals);
		const data = await request.formData();
		const attribute = String(data.get('attribute') ?? '').trim();
		const value = String(data.get('value') ?? '').trim();
		if (!attribute) return fail(400, { error: 'attribute_required' });
		if (attribute !== ATTR.WILDCARD && !value) return fail(400, { error: 'value_required' });
		await addGateRule(attribute, value);
		return { ok: true };
	},

	removeRule: async ({ request, locals }) => {
		requireCentral(locals);
		const data = await request.formData();
		const id = Number(data.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'bad_id' });
		await removeGateRule(id);
		return { ok: true };
	},

	block: async ({ request, locals }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const guarded = await guardTarget(locals, username);
		if (!('user' in guarded)) return guarded;
		await blockUser(username, guarded.user.username);
		return { ok: true };
	},

	unblock: async ({ request, locals }) => {
		requireCentral(locals);
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		if (!username) return fail(400, { error: 'bad_user' });
		await unblockUser(username);
		return { ok: true };
	},

	deleteUser: async ({ request, locals }) => {
		const data = await request.formData();
		const username = String(data.get('username') ?? '').trim();
		const guarded = await guardTarget(locals, username);
		if (!('user' in guarded)) return guarded;
		await deleteUser(username);
		return { ok: true };
	}
};
