import { json } from '@sveltejs/kit';
import { search, type SearchResult } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export type { SearchResult };

export const GET: RequestHandler = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;
	const results = await search(wsId, q);
	return json(results);
};
