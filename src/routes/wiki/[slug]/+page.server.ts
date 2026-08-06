import { error } from '@sveltejs/kit';
import { resolvePublicDocRefs } from '$lib/server/docs';
import { renderMarkdown } from '$lib/server/markdown';
import { getOrCompileSvg, TypstCompileError } from '$lib/server/typst';
import { getPublishedDoc } from '$lib/server/publication';
import { recordView, viewCounts } from '$lib/server/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const hit = await getPublishedDoc(params.slug);
	if (!hit) error(404);
	const { doc, source, title } = hit;

	let html = '';
	let renderError: string | null = null;
	try {
		if (doc.mode === 'markdown') {
			// Wikilinks only resolve into the public corpus; anything private
			// degrades to a broken link rather than leaking a title.
			const rendered = await renderMarkdown(source, {
				workspaceId: doc.workspaceId,
				resolveRefs: resolvePublicDocRefs,
				hrefFor: (ref) => (ref.publicSlug ? `/wiki/${encodeURIComponent(ref.publicSlug)}` : null)
			});
			html = rendered.html;
		} else {
			html = (await getOrCompileSvg(source)).svg;
		}
	} catch (err) {
		renderError = err instanceof TypstCompileError ? err.message : 'render failed';
	}

	recordView(doc.id, 'wiki');
	const views = (await viewCounts([doc.id])).get(doc.id) ?? 0;

	return {
		article: {
			title,
			mode: doc.mode,
			tags: doc.tags,
			updatedAt: doc.updatedAt.toISOString(),
			canOpenInApp: locals.access?.can(doc.workspaceId) ?? false,
			appHref: `/w/${doc.workspaceId}/${doc.slug}`
		},
		html,
		renderError,
		views
	};
};
