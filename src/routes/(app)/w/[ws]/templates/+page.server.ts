import { fail, redirect } from '@sveltejs/kit';
import { requireRole } from '$lib/server/apiGuards';
import { createTemplate, deleteTemplate, listTemplates } from '$lib/server/templates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, params.ws, 'editor');
	const templates = await listTemplates(params.ws);

	return {
		templates: templates.map((t) => ({
			slug: t.slug,
			name: t.name,
			updatedAt: t.updatedAt,
			createdBy: t.createdBy
		}))
	};
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		const { user } = requireRole(locals, params.ws, 'editor');
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'name required' });

		const created = await createTemplate({
			workspaceId: params.ws,
			name,
			actor: user.username
		});
		redirect(303, `/w/${params.ws}/templates/${created.slug}`);
	},

	delete: async ({ request, params, locals }) => {
		requireRole(locals, params.ws, 'maintainer');
		const data = await request.formData();
		await deleteTemplate(params.ws, String(data.get('slug') ?? ''));
		return { ok: true };
	}
};
