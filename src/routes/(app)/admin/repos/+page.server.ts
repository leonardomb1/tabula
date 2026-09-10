import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { requirePlatformAdmin } from '$lib/server/apiGuards';
import { db } from '$lib/server/db';
import { docs, workspaces } from '$lib/server/db/schema';
import { createWorkspace, deleteWorkspace, listWorkspaces, upsertBinding, WorkspaceExistsError } from '$lib/server/workspaces';
import { ATTR } from '$lib/server/access';
import { syncRepoWorkspace, type RepoConfig } from '$lib/server/repo/sync';
import { slugify } from '$lib/server/ids';
import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

/**
 * Repository mirrors as their own entities: created, configured and synced
 * here — never through the workspace admin. Underneath each mirror is a
 * workspace of kind 'repo' (docs need a workspaceId), but that is plumbing;
 * this screen is its home.
 */

function origin(): string {
	return (env.ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}

function repoView(id: string, cfg: RepoConfig | null) {
	return {
		url: cfg?.url ?? '',
		branch: cfg?.branch ?? 'main',
		username: cfg?.username ?? '',
		hasToken: !!cfg?.token,
		include: (cfg?.include ?? []).join(', '),
		lastCommit: cfg?.lastCommit ?? '',
		lastSyncAt: cfg?.lastSyncAt ?? '',
		lastError: cfg?.lastError ?? null,
		fileCount: cfg?.fileCount ?? 0,
		skipped: cfg?.skipped ?? null,
		// Full URL including the token — this screen is platform-admin only.
		webhookUrl: cfg?.webhookSecret
			? `${origin()}/api/repos/${id}/sync?token=${cfg.webhookSecret}`
			: null
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	requirePlatformAdmin(locals);
	const all = (await listWorkspaces()).filter((w) => w.kind === 'repo');
	const counts = await db
		.select({ ws: docs.workspaceId, n: sql<number>`count(*)` })
		.from(docs)
		.where(sql`${docs.deletedAt} is null and ${docs.ephemeral} = false`)
		.groupBy(docs.workspaceId);
	const countOf = new Map(counts.map((c) => [c.ws, Number(c.n)]));

	return {
		repos: all.map((w) => ({
			id: w.id,
			name: w.name,
			docCount: countOf.get(w.id) ?? 0,
			repo: repoView(w.id, w.repo as RepoConfig | null)
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const { user } = requirePlatformAdmin(locals);
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'name_required' });
		const id = `repo-${slugify(name)}`.slice(0, 63);

		try {
			await createWorkspace(id, name, 'repo', user.username);
			// Readable org-wide by default; tighten in the admin access tab if needed.
			await upsertBinding({ workspaceId: id, attribute: ATTR.WILDCARD, value: '*', role: 'viewer' });
		} catch (e) {
			if (e instanceof WorkspaceExistsError) return fail(409, { error: 'exists' });
			throw e;
		}
		redirect(303, '/admin/repos');
	},

	save: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
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
			.update(workspaces)
			.set({ repo: sql`coalesce(${workspaces.repo}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
			.where(eq(workspaces.id, ws));
		return { saved: ws };
	},

	sync: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		try {
			return { synced: ws, sync: await syncRepoWorkspace(ws) };
		} catch (err) {
			return fail(422, { error: err instanceof Error ? err.message : 'sync failed', ws });
		}
	},

	hookRotate: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		const patch: Partial<RepoConfig> = { webhookSecret: randomBytes(24).toString('hex') };
		await db
			.update(workspaces)
			.set({ repo: sql`coalesce(${workspaces.repo}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
			.where(eq(workspaces.id, ws));
		return { hooked: ws };
	},

	hookDisable: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		await db
			.update(workspaces)
			.set({ repo: sql`coalesce(${workspaces.repo}, '{}'::jsonb) - 'webhookSecret'` })
			.where(eq(workspaces.id, ws));
		return { unhooked: ws };
	},

	remove: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const ws = String(data.get('ws') ?? '');
		const target = (await listWorkspaces()).find((w) => w.id === ws);
		if (!target || target.kind !== 'repo') return fail(400, { error: 'not_repo' });
		await deleteWorkspace(ws);
		return { removed: ws };
	}
};
