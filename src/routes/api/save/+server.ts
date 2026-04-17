import { json, error } from '@sveltejs/kit';
import matter from 'gray-matter';
import { getText, putText, remove, list } from '$lib/server/storage';
import { upsertDoc, renameDoc, slugToKey, historyPrefix } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID, canAccess } from '$lib/server/workspaces';
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

async function moveHistory(wsId: string, oldSlug: string, newSlug: string): Promise<void> {
	const oldPrefix = `${historyPrefix(wsId)}${oldSlug}/`;
	const keys = await list(oldPrefix);
	for (const { key } of keys) {
		const content = await getText(key);
		if (content == null) continue;
		const newKey = key.replace(oldPrefix, `${historyPrefix(wsId)}${newSlug}/`);
		await putText(newKey, content);
		await remove(key);
	}
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
	const { slug, content, oldSlug } = await request.json();
	const wsParam = url.searchParams.get('ws');
	const wsId = validWsId(wsParam) ? wsParam : DEFAULT_WS_ID;

	if (!validSlug(slug)) error(400, 'Slug inválido — use letras, números, hífens e underscores');
	if (!content || typeof content !== 'string') error(400, 'Conteúdo obrigatório');
	if (oldSlug !== undefined && !validSlug(oldSlug)) error(400, 'oldSlug inválido');
	if (locals.user && !(await canAccess(locals.user.username, wsId))) error(404, 'Workspace não encontrado');

	const isRename = oldSlug && oldSlug !== slug;

	// Inject minimal frontmatter if the doc has none
	const parsed = matter(content);
	let finalContent = content;
	if (Object.keys(parsed.data).length === 0) {
		const today = new Date().toISOString().split('T')[0];
		const author = locals.user?.displayName ?? locals.user?.username ?? 'unknown';
		finalContent = `---\nauthor: ${author}\ndate: ${today}\n---\n\n${content}`;
	}

	await snapshot(wsId, isRename ? oldSlug : slug);

	await putText(slugToKey(wsId, slug), finalContent);

	if (isRename) {
		await moveHistory(wsId, oldSlug, slug);
		await remove(slugToKey(wsId, oldSlug));
		await renameDoc(wsId, oldSlug, slug);
	}

	await upsertDoc(wsId, slug, finalContent);

	return json({ ok: true, slug, ws: wsId });
};
