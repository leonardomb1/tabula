import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import { getDoc } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');

	// Phase 1: public docs resolve from the default workspace only.
	const doc = await getDoc(DEFAULT_WS_ID, slug);
	if (!doc) error(404, 'Documento não encontrado');

	const { html, toc, title, frontmatter } = renderMarkdown(doc.source);
	if (frontmatter.public !== true) error(404, 'Documento não encontrado');

	const createdDate = frontmatter.date
		? new Date(frontmatter.date as unknown as Date).toISOString()
		: null;

	return { html, toc, title, frontmatter: { ...frontmatter, date: createdDate }, slug };
};
