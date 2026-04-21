import {
	listForUser,
	getForUser,
	DEFAULT_WS_ID,
	PERSONAL_PREFIX,
	type Workspace
} from '$lib/server/workspaces';
import {
	listDocsChunk,
	listTagCounts,
	parseTagsParam,
	DEFAULT_LIMIT,
	type SortMode
} from '$lib/server/docsQuery';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	// Build the visible workspace list. Unauthenticated visitors see only the
	// default team (mostly a defensive code path — / is auth-gated).
	const user = locals.user;
	const workspaces: Workspace[] = user
		? await listForUser(user)
		: [{ id: DEFAULT_WS_ID, name: 'Geral', kind: 'team' }];

	// Resolve current workspace: cookie first, then Personal default for the
	// logged-in user, then the default team.
	const cookieWs = cookies.get('docs_ws');
	let current: Workspace | null = null;
	if (cookieWs && user) current = await getForUser(user, cookieWs);
	if (!current && user) {
		current = workspaces.find((w) => w.id === `${PERSONAL_PREFIX}${user.username}`) ?? null;
	}
	if (!current) current = workspaces[0];

	// First chunk + tag counts land in the same page load so the first
	// paint has real data and the sidebar doesn't flicker. Later chunks
	// come from /api/docs/list via infinite scroll on the client.
	// Tag filter on the URL (?tag=foo) remains supported — the header
	// still deep-links workspace tag links this way.
	const sortRaw = url.searchParams.get('sort');
	const sort: SortMode = sortRaw === 'alpha' ? 'alpha' : 'recent';
	// Legacy single `?tag=` links coexist with the new multi `?tags=a,b`
	// shape. Merge both so a click from the reader's tag chip still lands
	// with that tag pre-selected.
	const tags = [
		...parseTagsParam(url.searchParams.get('tags')),
		...(url.searchParams.get('tag') ? [url.searchParams.get('tag') as string] : [])
	];

	const [chunk, tagCounts] = await Promise.all([
		listDocsChunk(current.id, { tags, sort, offset: 0, limit: DEFAULT_LIMIT }),
		listTagCounts(current.id)
	]);

	return {
		docs: chunk.docs,
		total: chunk.total,
		hasMore: chunk.hasMore,
		initialLimit: chunk.limit,
		initialTags: tags,
		initialSort: sort,
		tagCounts,
		workspaces,
		currentWs: current
	};
};
