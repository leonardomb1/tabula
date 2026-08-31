import { error, fail } from '@sveltejs/kit';
import { getWorkspace } from '$lib/server/workspaces';
import { loadIndexData } from '$lib/server/docsQuery';
import { discardDraft, listDrafts } from '$lib/server/drafts';
import { getDoc, promoteDoc } from '$lib/server/docs';
import { personalWorkspaceId } from '$lib/server/ids';
import { requireUser } from '$lib/server/apiGuards';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.access?.can(params.ws)) error(403);
	const workspace = await getWorkspace(params.ws);
	if (!workspace) error(404);

	// Drafts are only ever shown in their owner's own personal workspace: they are
	// half-finished by nature, and nobody else has a reason to see them.
	const own = !!locals.user && params.ws === personalWorkspaceId(locals.user.username);

	return {
		workspace,
		...(await loadIndexData(params.ws, url)),
		canWrite: locals.access.can(params.ws, 'editor') && workspace.kind !== 'repo',
		drafts: own ? await listDrafts(params.ws) : []
	};
};

/** Both actions refuse anything that is not a draft in the caller's own workspace. */
async function ownDraft(locals: App.Locals, ws: string, id: unknown) {
	const { user } = requireUser(locals);
	if (typeof id !== 'string' || !id) return { ok: false as const, failure: fail(400, { error: 'bad_id' }) };
	if (ws !== personalWorkspaceId(user.username)) {
		return { ok: false as const, failure: fail(403, { error: 'forbidden' }) };
	}
	const doc = await getDoc(id);
	if (!doc || doc.workspaceId !== ws || !doc.ephemeral) {
		return { ok: false as const, failure: fail(404, { error: 'not_found' }) };
	}
	return { ok: true as const, doc, actor: user.username };
}

export const actions: Actions = {
	keep: async ({ params, locals, request }) => {
		const id = (await request.formData()).get('id');
		const found = await ownDraft(locals, params.ws, id);
		if (!found.ok) return found.failure;
		const kept = await promoteDoc(found.doc.id, found.actor);
		return { kept: kept.slug };
	},

	discard: async ({ params, locals, request }) => {
		const id = (await request.formData()).get('id');
		const found = await ownDraft(locals, params.ws, id);
		if (!found.ok) return found.failure;
		await discardDraft(found.doc.id);
		return { discarded: true };
	}
};
