import { fail, redirect } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';
import { requireRole } from '$lib/server/apiGuards';
import { createDoc } from '$lib/server/docs';
import { readDocForm } from '$lib/server/docForm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, params.ws, 'editor');
	return {};
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const { user } = requireRole(locals, params.ws, 'editor');
		const values = readDocForm(await request.formData());

		if (!values.title) {
			return fail(400, { error: m.editor_error_title_required(), ...values });
		}

		const doc = await createDoc({
			workspaceId: params.ws,
			title: values.title,
			mode: values.mode,
			source: values.source,
			tags: values.tags,
			isPublic: values.isPublic,
			frontmatter: values.frontmatter,
			actor: user.username
		});

		redirect(303, `/w/${params.ws}/${doc.slug}`);
	}
};
