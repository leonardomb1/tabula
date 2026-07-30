import { error, redirect } from '@sveltejs/kit';
import { requireRole } from '$lib/server/apiGuards';
import { getDocBySlug, listVersions, restoreVersion } from '$lib/server/docs';
import { displayNamesFor, nameOf } from '$lib/server/userSettings';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.access?.can(params.ws)) error(403);
	const doc = await getDocBySlug(params.ws, params.slug);
	if (!doc) error(404);

	const versions = await listVersions(doc.id);
	const names = await displayNamesFor(versions.map((v) => v.editor));

	return {
		doc: { id: doc.id, slug: doc.slug, title: doc.title, mode: doc.mode, source: doc.source },
		versions: versions.map((v) => ({
			versionNo: v.versionNo,
			kind: v.kind,
			title: v.title,
			source: v.source,
			editor: nameOf(names, v.editor),
			createdAt: v.createdAt
		})),
		canRestore: locals.access.can(params.ws, 'editor')
	};
};

export const actions: Actions = {
	restore: async ({ request, params, locals }) => {
		const { user } = requireRole(locals, params.ws, 'editor');
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) error(404);

		const data = await request.formData();
		const versionNo = Number(data.get('versionNo'));
		if (!Number.isInteger(versionNo)) error(400, 'invalid version');

		await restoreVersion(doc.id, versionNo, user.username);
		redirect(303, `/w/${params.ws}/${doc.slug}`);
	}
};
