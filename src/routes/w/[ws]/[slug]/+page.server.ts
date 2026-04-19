import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import { getDoc, findBacklinks } from '$lib/server/docsIndex';
import { getForUser, listForUser } from '$lib/server/workspaces';
import {
	getStyleForTemplate,
	parseReferences,
	processCitations,
	shortLabel,
	stripReferencesHeading
} from '$lib/server/pdf/citations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { ws: wsId, slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	if (!/^[a-z0-9-]+$/.test(wsId)) error(400, 'Workspace inválido');

	// Access check — 404 (not 403) so we don't leak ws ids to non-members.
	const username = locals.user?.username;
	if (!username) error(401, 'Não autenticado');
	const ws = await getForUser(username, wsId);
	if (!ws) error(404, 'Documento não encontrado');

	// Sticky workspace selection — visiting a doc URL pins this workspace as
	// the user's active one so the back-link, /, and "+ Novo" stay in context.
	cookies.set('docs_ws', wsId, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 365
	});

	const doc = await getDoc(wsId, slug);
	if (!doc) error(404, 'Documento não encontrado');

	const rendered = renderMarkdown(doc.source);
	const { toc, title, frontmatter } = rendered;
	let html = rendered.html;

	// Reading stats — computed off the raw source, not the rendered HTML,
	// so markup doesn't inflate the count. 200 wpm is the common-range
	// estimate for Portuguese/English mixed technical content; rounds up
	// so a 1-word doc still shows "1 min" rather than "0 min".
	const wordCount = (doc.source.match(/\S+/g) ?? []).length;
	const readMinutes = Math.max(1, Math.round(wordCount / 200));

	// ── Citations in the web view ──────────────────────────────────────
	// Academic templates (abnt/acm/ieee) can declare a `references:` map
	// in their frontmatter sub-block. When present, rewrite inline
	// [@key] tokens into styled anchors and append a formatted references
	// section to the body — same pipeline the PDF uses, so web and print
	// stay visually aligned.
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

	const backlinks = await findBacklinks(wsId, slug);

	return {
		html,
		toc,
		title,
		frontmatter: { ...frontmatter, date: createdDate },
		slug,
		mtime: doc.mtime,
		backlinks,
		citedRefs,
		wordCount,
		readMinutes,
		ws,
		// All workspaces the user can see — used for the UserMenu subtitle list.
		workspaces: await listForUser(username)
	};
};
