import { error, json } from '@sveltejs/kit';
import { canAccess, isRoutableWsId } from '$lib/server/workspaces';
import { listDocsChunk, parseTagsParam, type SortMode } from '$lib/server/docsQuery';
import type { RequestHandler } from './$types';

/**
 * Chunk endpoint for the home-page infinite-scroll list. Returns a
 * filtered + sorted slice of a workspace's docs, plus a `hasMore` flag
 * the client uses to decide whether to keep fetching.
 *
 * Query params:
 *   ws     — workspace id (required; checked against the user's access)
 *   tags   — comma-separated list, AND-matched (optional)
 *   sort   — "recent" | "alpha" (default "recent")
 *   offset — zero-based row offset (default 0)
 *   limit  — chunk size (default 50, max 200)
 *
 * Kept separate from /api/search so chat-style search and list-scroll
 * don't share a response shape by accident — the two screens are likely
 * to diverge (facets, highlights) and coupling them hurts later.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) error(401, 'Autenticação obrigatória');

	const wsId = url.searchParams.get('ws');
	if (!isRoutableWsId(wsId)) error(400, 'Workspace inválido');
	if (!(await canAccess(locals.user, wsId))) error(403, 'Sem acesso a esse workspace');

	const sortRaw = url.searchParams.get('sort');
	const sort: SortMode = sortRaw === 'alpha' ? 'alpha' : 'recent';
	const tags = parseTagsParam(url.searchParams.get('tags'));
	const offset = Number(url.searchParams.get('offset') ?? '0');
	const limit = Number(url.searchParams.get('limit') ?? '50');

	if (!Number.isFinite(offset) || !Number.isFinite(limit)) {
		error(400, 'offset e limit devem ser numéricos');
	}

	const chunk = await listDocsChunk(wsId, { tags, sort, offset, limit });
	return json(chunk);
};
