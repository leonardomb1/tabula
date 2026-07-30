import { fail, redirect } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';
import { requireRole } from '$lib/server/apiGuards';
import { createDoc } from '$lib/server/docs';
import { readDocForm } from '$lib/server/docForm';
import { requestPublish } from '$lib/server/publication';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, params.ws, 'editor');
	return {};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const { user, access } = requireRole(locals, params.ws, 'editor');
		const values = readDocForm(await request.formData());

		if (!values.title) {
			return fail(400, { error: m.editor_error_title_required(), ...values });
		}

		// Created private; publication is policy-gated.
		const doc = await createDoc({
			workspaceId: params.ws,
			title: values.title,
			mode: values.mode,
			source: values.source,
			tags: values.tags,
			frontmatter: values.frontmatter,
			actor: user.username
		});

		if (values.isPublic) {
			const outcome = await requestPublish(doc, access);
			if (outcome === 'forbidden') {
				// The doc exists, just not public — surface it rather than failing the create.
				redirect(303, `/w/${params.ws}/${doc.slug}`);
			}
		}

		redirect(303, `/w/${params.ws}/${doc.slug}`);
	}
};
