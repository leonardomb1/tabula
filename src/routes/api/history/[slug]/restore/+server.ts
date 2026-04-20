import { json, error } from '@sveltejs/kit';
import { getText, putText } from '$lib/server/storage';
import { upsertDoc, slugToKey, historyPrefix } from '$lib/server/docsIndex';
import { canWrite, isRoutableWsId } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, url, locals }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	const wsId = url.searchParams.get('ws');
	if (!isRoutableWsId(wsId)) error(400, 'Workspace inválido');

	if (!locals.user) error(401, 'Autenticação obrigatória');
	if (!(await canWrite(locals.user, wsId))) error(403, 'Sem permissão para restaurar versões');

	const { timestamp } = await request.json();
	if (!timestamp || typeof timestamp !== 'number') error(400, 'Timestamp obrigatório');

	const snapKey = `${historyPrefix(wsId)}${slug}/${timestamp}.md`;
	const restored = await getText(snapKey);
	if (restored == null) error(404, 'Versão não encontrada');

	// Snapshot current before restoring
	const current = await getText(slugToKey(wsId, slug));
	if (current != null) {
		await putText(`${historyPrefix(wsId)}${slug}/${Date.now()}.md`, current);
	}

	await putText(slugToKey(wsId, slug), restored);
	await upsertDoc(wsId, slug, restored);

	return json({ ok: true, content: restored });
};
