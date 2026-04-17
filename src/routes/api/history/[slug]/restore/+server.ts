import { json, error } from '@sveltejs/kit';
import { getText, putText } from '$lib/server/storage';
import { upsertDoc, slugToKey, historyPrefix } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, url }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;

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
