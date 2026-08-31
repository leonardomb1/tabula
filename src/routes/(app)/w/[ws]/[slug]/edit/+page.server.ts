import { error, fail, redirect } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';
import { requireRole } from '$lib/server/apiGuards';
import { getDocBySlug, softDeleteDoc, updateDoc } from '$lib/server/docs';
import { readDocForm } from '$lib/server/docForm';
import { onDocUpdated } from '$lib/server/publication';
import { listTemplates } from '$lib/server/templates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, params.ws, 'editor');
	const doc = await getDocBySlug(params.ws, params.slug);
	if (!doc) error(404);

	const fmTemplate = (doc.frontmatter as Record<string, unknown>)?.template;
	return {
		doc: {
			id: doc.id,
			slug: doc.slug,
			title: doc.title,
			mode: doc.mode,
			source: doc.source,
			tags: doc.tags,
			isPublic: doc.isPublic,
			template: typeof fmTemplate === 'string' ? fmTemplate : ''
		},
		templates: (await listTemplates(params.ws)).map((t) => ({ slug: t.slug, name: t.name }))
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		const { user } = requireRole(locals, params.ws, 'editor');
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) error(404);

		const values = readDocForm(await request.formData());
		if (!values.title) {
			return fail(400, { error: m.editor_error_title_required(), ...values });
		}

		// Editing is content-only; publication is managed from the doc's publish
		// panel. A published doc's snapshot follows the edit immediately.
		const updated = await updateDoc(
			doc.id,
			{
				title: values.title,
				mode: values.mode,
				source: values.source,
				tags: values.tags,
				frontmatter: values.frontmatter
			},
			user.username
		);
		await onDocUpdated(updated);

		redirect(303, `/w/${params.ws}/${doc.slug}`);
	},

	delete: async ({ params, locals }) => {
		const { user } = requireRole(locals, params.ws, 'maintainer');
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) error(404);

		await softDeleteDoc(doc.id, user.username);
		redirect(303, `/w/${params.ws}`);
	}
};
