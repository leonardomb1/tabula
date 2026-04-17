import { error, text } from '@sveltejs/kit';
import { getDoc } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const slug = url.searchParams.get('slug') ?? '';
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;

	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Invalid slug');

	const doc = await getDoc(wsId, slug);
	if (!doc) error(404, 'Not found');

	return text(doc.source);
};
