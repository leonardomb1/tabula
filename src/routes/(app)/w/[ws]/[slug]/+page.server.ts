import { error } from '@sveltejs/kit';
import { getBacklinks, getDocBySlug, resolveDocRefs } from '$lib/server/docs';
import { renderMarkdown } from '$lib/server/markdown';
import { getOrCompileSvg, TypstCompileError } from '$lib/server/typst';
import { listTemplates, parseTemplateMeta } from '$lib/server/templates';
import { getPeople, unknownPerson } from '$lib/server/people';
import type { Person } from '$lib/people';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const doc = await getDocBySlug(params.ws, params.slug);
	if (!doc) error(404);
	if (!doc.isPublic && !locals.access?.can(params.ws)) error(403);

	let html = '';
	let renderError: string | null = null;
	try {
		if (doc.mode === 'markdown') {
			const rendered = await renderMarkdown(doc.source, {
				workspaceId: params.ws,
				resolveRefs: resolveDocRefs
			});
			html = rendered.html;
		} else {
			html = (await getOrCompileSvg(doc.source)).svg;
		}
	} catch (err) {
		renderError = err instanceof TypstCompileError ? err.message : 'render failed';
	}

	const [backlinks, templates, people] = await Promise.all([
		getBacklinks(doc),
		listTemplates(params.ws),
		doc.updatedBy && locals.user
			? getPeople([doc.updatedBy], params.ws)
			: Promise.resolve({} as Record<string, Person>)
	]);

	return {
		canWrite: locals.access?.can(params.ws, 'editor') ?? false,
		templates: templates.map((t) => ({
			slug: t.slug,
			name: t.name,
			...parseTemplateMeta(t.source)
		})),
		defaultTemplate:
			typeof (doc.frontmatter as Record<string, unknown>)?.template === 'string'
				? ((doc.frontmatter as Record<string, string>).template ?? '')
				: '',
		doc: {
			id: doc.id,
			slug: doc.slug,
			title: doc.title,
			mode: doc.mode,
			tags: doc.tags,
			isPublic: doc.isPublic,
			updatedAt: doc.updatedAt,
			updatedBy: doc.updatedBy
				? (people[doc.updatedBy] ?? unknownPerson(doc.updatedBy))
				: null,
			frontmatter: doc.frontmatter as Record<string, unknown>
		},
		html,
		renderError,
		backlinks: backlinks.map((b) => ({ id: b.id, slug: b.slug, title: b.title }))
	};
};
