import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import { getDoc, findBacklinks } from '$lib/server/docsIndex';
import { getForUser, listForUser } from '$lib/server/workspaces';
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

	const { html, toc, title, frontmatter } = renderMarkdown(doc.source);

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
		ws,
		// All workspaces the user can see — used for the UserMenu subtitle list.
		workspaces: await listForUser(username)
	};
};
