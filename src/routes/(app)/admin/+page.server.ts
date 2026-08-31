import { error, fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { ATTR, bindableAttributes, ROLES, type Role } from '$lib/server/access';
import { sanitizePolicy } from '$lib/policy';
import {
	createWorkspace,
	deleteWorkspace,
	getWorkspace,
	listBindings,
	listWorkspaces,
	removeBinding,
	updatePolicy,
	updateWorkspace,
	upsertBinding,
	WorkspaceExistsError
} from '$lib/server/workspaces';
import { syncRepoWorkspace, type RepoConfig } from '$lib/server/repo/sync';
import { db } from '$lib/server/db';
import { workspaces as workspacesTable } from '$lib/server/db/schema';
import { eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const RESERVED = new Set(['default']);
const ROLE_SET = new Set<Role>(ROLES);

type Section = 'general' | 'access' | 'policy' | 'review' | 'repo';
const SECTIONS: Section[] = ['general', 'access', 'policy', 'review', 'repo'];

async function manageable(locals: App.Locals) {
	const { access } = requireUser(locals);
	return (await listWorkspaces())
		.filter((w) => w.kind !== 'personal' && !w.id.startsWith('personal-'))
		.filter((w) => access.can(w.id, 'maintainer'))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function requireCentral(locals: App.Locals) {
	const ctx = requireUser(locals);
	if (!ctx.user.isPlatformAdmin) throw error(403, 'platform admin required');
	return ctx;
}

function requireMaintainer(locals: App.Locals, ws: string) {
	const ctx = requireUser(locals);
	if (!ctx.access.can(ws, 'maintainer')) throw error(403, `requires maintainer on ${ws}`);
	return ctx;
}

/** Repo config as shown to admins: everything but the token itself. */
function repoView(cfg: RepoConfig | null) {
	return {
		url: cfg?.url ?? '',
		branch: cfg?.branch ?? 'main',
		username: cfg?.username ?? '',
		hasToken: !!cfg?.token,
		include: (cfg?.include ?? []).join(', '),
		lastCommit: cfg?.lastCommit ?? '',
		lastSyncAt: cfg?.lastSyncAt ?? '',
		lastError: cfg?.lastError ?? null,
		fileCount: cfg?.fileCount ?? 0
	};
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = requireUser(locals);
	const workspaces = await manageable(locals);
	if (!workspaces.length && !user.isPlatformAdmin) throw error(403, 'nothing to administer');

	const requested = url.searchParams.get('ws');
	const current = workspaces.find((w) => w.id === requested) ?? workspaces[0] ?? null;

	const bindings = current ? await listBindings(current.id) : [];

	const asked = url.searchParams.get('section');
	const section = SECTIONS.includes(asked as Section) ? (asked as Section) : 'general';

	return {
		section,
		isPlatformAdmin: user.isPlatformAdmin,
		workspaces: workspaces.map((w) => ({
			id: w.id,
			name: w.name,
			kind: w.kind,
			policy: sanitizePolicy(w.policy)
		})),
		current: current
			? {
					id: current.id,
					name: current.name,
					kind: current.kind,
					deletable: current.kind !== 'system',
					repo: repoView(current.repo as RepoConfig | null),
					policy: sanitizePolicy(current.policy),
					bindings: bindings
						.map((b) => ({ id: b.id, attribute: b.attribute, value: b.value, role: b.role }))
						.sort(
							(a, b) => a.attribute.localeCompare(b.attribute) || a.value.localeCompare(b.value)
						)
				}
			: null,
		attributes: await bindableAttributes(),
		you: { username: user.username, claims: user.claims }
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { user } = requireCentral(locals);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim().toLowerCase();
		const name = String(data.get('name') ?? '').trim();

		if (!ID_RE.test(id) || id.startsWith('personal-') || RESERVED.has(id)) {
			return fail(400, { error: 'invalid_id' });
		}
		if (!name) return fail(400, { error: 'name_required' });

		try {
			await createWorkspace(id, name, 'team', user.username);
		} catch (e) {
			if (e instanceof WorkspaceExistsError) return fail(409, { error: 'exists' });
			throw e;
		}
		redirect(303, `/admin?ws=${encodeURIComponent(id)}`);
	},

	rename: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireMaintainer(locals, ws);
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'name_required' });
		await updateWorkspace(ws, name);
		return { ok: true };
	},

	remove: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireCentral(locals);
		const workspace = await getWorkspace(ws);
		if (!workspace) return fail(404, { error: 'not_found' });
		if (workspace.kind === 'system' || ws.startsWith('personal-')) {
			return fail(403, { error: 'undeletable' });
		}
		await deleteWorkspace(ws);
		redirect(303, '/admin');
	},

	addBinding: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireCentral(locals);
		const attribute = String(data.get('attribute') ?? '').trim();
		const role = String(data.get('role') ?? '') as Role;
		if (!attribute) return fail(400, { error: 'attribute_required' });
		if (!ROLE_SET.has(role)) return fail(400, { error: 'bad_role' });

		const value =
			attribute === ATTR.WILDCARD ? '*' : String(data.get('value') ?? '').trim();
		if (attribute !== ATTR.WILDCARD && !value) return fail(400, { error: 'value_required' });

		await upsertBinding({ workspaceId: ws, attribute, value, role });
		return { ok: true };
	},

	removeBinding: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireCentral(locals);
		const id = Number(data.get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'bad_id' });
		await removeBinding(ws, id);
		return { ok: true };
	},

	savePolicy: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireMaintainer(locals, ws);

		let parsed: unknown;
		try {
			parsed = JSON.parse(String(data.get('policy') ?? '{}'));
		} catch {
			return fail(400, { error: 'bad_policy' });
		}

		const candidate = sanitizePolicy(parsed);
		await updatePolicy(ws, candidate);
		return { saved: true };
	},

	repoSave: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireMaintainer(locals, ws);

		const url = String(data.get('url') ?? '').trim();
		const branch = String(data.get('branch') ?? '').trim() || 'main';
		const username = String(data.get('username') ?? '').trim();
		const token = String(data.get('token') ?? '').trim();
		const include = String(data.get('include') ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (!url) return fail(400, { error: 'repo_url_required' });

		// A blank token field keeps the stored one; changing it is explicit.
		const patch: Partial<RepoConfig> = { url, branch, username, include };
		if (token) patch.token = token;

		await db
			.update(workspacesTable)
			.set({
				repo: sql`coalesce(${workspacesTable.repo}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`
			})
			.where(eq(workspacesTable.id, ws));
		return { saved: true };
	},

	repoSync: async ({ request, locals }) => {
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		requireMaintainer(locals, ws);
		try {
			return { sync: await syncRepoWorkspace(ws) };
		} catch (err) {
			return fail(422, { error: err instanceof Error ? err.message : 'sync failed' });
		}
	}
};
