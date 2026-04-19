import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import { getDoc } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import {
	getStyleForTemplate,
	parseReferences,
	processCitations,
	shortLabel,
	stripReferencesHeading
} from '$lib/server/pdf/citations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');

	// Phase 1: public docs resolve from the default workspace only. Phase 2
	// will iterate every workspace and merge any doc with public:true.
	const doc = await getDoc(DEFAULT_WS_ID, slug);
	if (!doc) error(404, 'Documento não encontrado');

	const rendered = renderMarkdown(doc.source);
	const { toc, title, frontmatter } = rendered;
	if (frontmatter.public !== true) error(404, 'Documento não encontrado');
	let html = rendered.html;

	// Reading stats — off the raw source so markup doesn't inflate counts.
	const wordCount = (doc.source.match(/\S+/g) ?? []).length;
	const readMinutes = Math.max(1, Math.round(wordCount / 200));

	// Citation pipeline — same as the authed viewer so academic docs
	// render with formatted [@key] citations + a references section.
	const templateId = typeof frontmatter.template === 'string' ? frontmatter.template : null;
	const citationStyle = templateId ? getStyleForTemplate(templateId) : null;
	const templateOpts = templateId
		? ((frontmatter as unknown as Record<string, unknown>)[templateId] ?? {})
		: {};
	const references = parseReferences(
		typeof templateOpts === 'object' && templateOpts !== null && !Array.isArray(templateOpts)
			? (templateOpts as Record<string, unknown>).references
			: undefined
	);

	let citedRefs: Array<{ key: string; label: string; title: string }> = [];
	if (citationStyle && Object.keys(references).length > 0) {
		const cite = processCitations(html, references, citationStyle);
		if (cite.hasCitations) {
			html = stripReferencesHeading(cite.body) + cite.referencesHtml;
			citedRefs = cite.emitted.map((r) => ({
				key: r.key,
				label: shortLabel(r),
				title: r.title
			}));
		}
	}

	const createdDate = frontmatter.date
		? new Date(frontmatter.date as unknown as Date).toISOString()
		: null;

	return {
		html,
		toc,
		title,
		frontmatter: { ...frontmatter, date: createdDate },
		slug,
		mtime: doc.mtime,
		wordCount,
		readMinutes,
		citedRefs
	};
};
