import { json, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { searchDocs } from '$lib/server/search';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { access } = requireUser(locals);
	const query = url.searchParams.get('q') ?? '';
	const workspaceId = url.searchParams.get('ws') || undefined;

	const hits = await searchDocs(access, { query, workspaceId, limit: 12 });
	return json({ hits });
};
