import { error, redirect } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import { getDoc, type CachedDoc } from '$lib/server/docsIndex';
import { listAllWorkspaces } from '$lib/server/workspacesAdmin';
import { slugifyTitle } from '$lib/ids';
import {
	getStyleForTemplate,
	parseReferences,
	processCitations,
	shortLabel,
	stripReferencesHeading
} from '$lib/server/pdf/citations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const { slug } = params;
	const titleSeg = params.title ?? '';
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	if (titleSeg && !/^[a-z0-9-]+$/.test(titleSeg)) error(400, 'Título inválido');

	// Ids are globally unique but stored per-workspace. Scan every workspace
	// and return the first hit that opts into public access.
	const workspaces = await listAllWorkspaces();
	let doc: CachedDoc | null = null;
	for (const ws of workspaces) {
		const hit = await getDoc(ws.id, slug);
		if (hit && hit.frontmatter.public === true) {
			doc = hit;
			break;
		}
	}
	if (!doc) error(404, 'Documento não encontrado');

	const rendered = renderMarkdown(doc.source);
	const { toc, title, frontmatter } = rendered;

	const canonicalTitle = slugifyTitle(title);
	if (canonicalTitle && titleSeg !== canonicalTitle) {
		redirect(301, `/public/${slug}/${canonicalTitle}${url.search}`);
	}

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
