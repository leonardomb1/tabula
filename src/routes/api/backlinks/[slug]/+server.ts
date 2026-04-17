import { json } from '@sveltejs/kit';
import { findBacklinks } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;
	const results = await findBacklinks(wsId, params.slug);
	return json(results);
};
