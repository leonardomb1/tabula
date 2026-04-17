import { json, error } from '@sveltejs/kit';
import { list } from '$lib/server/storage';
import { historyPrefix } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export interface HistoryEntry {
	timestamp: number;
	label: string;
}

export const GET: RequestHandler = async ({ params, url }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;

	const prefix = `${historyPrefix(wsId)}${slug}/`;
	const keys = await list(prefix);

	const entries: HistoryEntry[] = [];
	for (const { key } of keys) {
		const filename = key.slice(prefix.length);
		if (!filename.endsWith('.md')) continue;
		const timestamp = parseInt(filename.replace('.md', ''));
		if (isNaN(timestamp)) continue;
		const d = new Date(timestamp);
		entries.push({
			timestamp,
			label: d.toLocaleString('pt-BR', {
				day: '2-digit', month: 'short', year: 'numeric',
				hour: '2-digit', minute: '2-digit'
			})
		});
	}

	entries.sort((a, b) => b.timestamp - a.timestamp);
	return json(entries);
};
