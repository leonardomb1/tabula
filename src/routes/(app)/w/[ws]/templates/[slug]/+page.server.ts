import { error, redirect } from '@sveltejs/kit';
import { requireRole } from '$lib/server/apiGuards';
import {
	deleteTemplate,
	getTemplate,
	parseTemplateMeta,
	TEMPLATE_INPUT_KEYS,
	updateTemplate
} from '$lib/server/templates';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, params.ws, 'editor');
	const template = await getTemplate(params.ws, params.slug);
	if (!template) error(404);

	return {
		template: { slug: template.slug, name: template.name, source: template.source },
		inputKeys: [
			...TEMPLATE_INPUT_KEYS,
			...parseTemplateMeta(template.source).options.map((o) => `fm.${o.key}`)
		]
	};
};

export const actions: Actions = {
	save: async ({ request, params, locals }) => {
		requireRole(locals, params.ws, 'editor');
		const data = await request.formData();
		await updateTemplate(params.ws, params.slug, {
			name: String(data.get('name') ?? '').trim() || undefined,
			source: String(data.get('source') ?? '')
		});
		redirect(303, `/w/${params.ws}/templates`);
	},

	delete: async ({ params, locals }) => {
		requireRole(locals, params.ws, 'maintainer');
		await deleteTemplate(params.ws, params.slug);
		redirect(303, `/w/${params.ws}/templates`);
	}
};
