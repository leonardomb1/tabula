import { json, error } from '@sveltejs/kit';
import matter from 'gray-matter';
import { exists, getText, putText } from '$lib/server/storage';
import { upsertDoc, slugToKey, historyPrefix } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID, canWrite } from '$lib/server/workspaces';
import { newDocId } from '$lib/ids';
import type { RequestHandler } from './$types';

function validSlug(s: unknown): s is string {
	return typeof s === 'string' && /^[a-zA-Z0-9_-]+$/.test(s);
}

function validWsId(s: unknown): s is string {
	return typeof s === 'string' && /^[a-z0-9-]+$/.test(s);
}

async function snapshot(wsId: string, slug: string): Promise<void> {
	const current = await getText(slugToKey(wsId, slug));
	if (current == null) return;
	await putText(`${historyPrefix(wsId)}${slug}/${Date.now()}.md`, current);
}

/**
 * Pick an id that isn't already taken in this workspace. At 10 base62
 * chars the random collision probability is negligible, but checking
 * `exists` anyway costs nothing and rules out adversarial / ultra-rare
 * cases. We retry a handful of times before giving up.
 */
async function mintUniqueId(wsId: string): Promise<string> {
	for (let i = 0; i < 8; i++) {
		const id = newDocId();
		if (!(await exists(slugToKey(wsId, id)))) return id;
	}
	throw new Error('Failed to mint a unique id after 8 attempts');
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
	const { slug, content } = await request.json();
	const wsParam = url.searchParams.get('ws');
	const wsId = validWsId(wsParam) ? wsParam : DEFAULT_WS_ID;

	if (!content || typeof content !== 'string') error(400, 'Conteúdo obrigatório');
	if (slug !== undefined && !validSlug(slug)) error(400, 'Slug inválido');

	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canWrite(locals.user, wsId))) error(403, 'Sem permissão para editar este workspace');

	// New doc: client sends no `slug`, server mints one. Existing doc: client
	// echoes the slug back so we know which file to overwrite. Renames went
	// away when slugs stopped being user-editable — the URL is stable for the
	// life of the document.
	const finalSlug = slug ?? (await mintUniqueId(wsId));

	// Inject minimal frontmatter if the doc has none so the viewer has
	// something to render as author/date metadata.
	const parsed = matter(content);
	let finalContent = content;
	if (Object.keys(parsed.data).length === 0) {
		const today = new Date().toISOString().split('T')[0];
		const author = locals.user?.displayName ?? locals.user?.username ?? 'unknown';
		finalContent = `---\nauthor: ${author}\ndate: ${today}\n---\n\n${content}`;
	}

	await snapshot(wsId, finalSlug);
	await putText(slugToKey(wsId, finalSlug), finalContent);
	await upsertDoc(wsId, finalSlug, finalContent);

	return json({ ok: true, slug: finalSlug, ws: wsId });
};
