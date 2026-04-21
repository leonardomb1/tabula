/**
 * Shared filter/sort/slice used by the home page's initial load and by
 * the `/api/docs/list` chunk endpoint. Keeps a single source of truth
 * for what "page 2 of the list" means — so the first paint on the
 * server and the infinite-scroll fetches on the client can't drift.
 *
 * All operations run over the in-memory `getAllDocs(wsId)` cache, so
 * pagination here is just sorting + slicing an array; there's no
 * database round-trip per chunk.
 */
import { getAllDocs } from './docsIndex';

export type SortMode = 'recent' | 'alpha';

export interface ListedDoc {
	slug: string;
	title: string;
	mtime: Date;
	date: Date | null;
	tags: string[];
	description: string | null;
}

export interface TagCount {
	tag: string;
	count: number;
}

export interface DocsChunk {
	docs: ListedDoc[];
	total: number;
	offset: number;
	limit: number;
	hasMore: boolean;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Produce a compact ListedDoc from a CachedDoc. */
function toListed(d: Awaited<ReturnType<typeof getAllDocs>>[number]): ListedDoc {
	const tags = Array.isArray(d.frontmatter.tags) ? d.frontmatter.tags.map(String) : [];
	const date = d.frontmatter.date
		? new Date(d.frontmatter.date as unknown as Date)
		: null;
	const description =
		typeof d.frontmatter.description === 'string' ? d.frontmatter.description : null;
	return { slug: d.slug, title: d.title, mtime: d.mtime, date, tags, description };
}

function compare(a: ListedDoc, b: ListedDoc, sort: SortMode): number {
	if (sort === 'alpha') {
		return a.title.localeCompare(b.title, 'pt-BR');
	}
	// 'recent' — date desc with a slug tiebreaker so ordering is stable
	// even when two docs share a date (or an undated doc falls back to
	// mtime at the same second).
	const ad = (a.date ?? a.mtime).getTime();
	const bd = (b.date ?? b.mtime).getTime();
	if (ad !== bd) return bd - ad;
	return a.slug.localeCompare(b.slug);
}

/**
 * Fetch the filtered, sorted slice of `wsId`'s docs. `tags` is AND-
 * matched: a doc passes only if it has every tag in the list. Empty
 * `tags` means no filter. `offset` / `limit` are clamped to sane bounds.
 */
export async function listDocsChunk(
	wsId: string,
	opts: {
		tags?: string[];
		sort?: SortMode;
		offset?: number;
		limit?: number;
	} = {}
): Promise<DocsChunk> {
	const cached = await getAllDocs(wsId);
	const tags = opts.tags ?? [];
	const sort: SortMode = opts.sort === 'alpha' ? 'alpha' : 'recent';
	const offset = Math.max(0, Math.floor(opts.offset ?? 0));
	const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT)));

	const filtered = cached
		.map(toListed)
		.filter((d) => (tags.length === 0 ? true : tags.every((t) => d.tags.includes(t))));

	filtered.sort((a, b) => compare(a, b, sort));

	const slice = filtered.slice(offset, offset + limit);
	return {
		docs: slice,
		total: filtered.length,
		offset,
		limit,
		hasMore: offset + slice.length < filtered.length
	};
}

/**
 * Workspace-wide tag inventory with counts. Not filter-aware — counts
 * are over the full doc set, so a tag's count stays stable as the user
 * toggles filters on and off. Returned alongside the first chunk so the
 * rail can render without a second round-trip.
 */
export async function listTagCounts(wsId: string): Promise<TagCount[]> {
	const cached = await getAllDocs(wsId);
	const counts = new Map<string, number>();
	for (const d of cached) {
		const tags = Array.isArray(d.frontmatter.tags) ? d.frontmatter.tags.map(String) : [];
		for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR'));
}

/**
 * Parse `?tags=foo,bar,baz` from a URLSearchParams into a canonical
 * string[]. Trimmed, empty entries dropped, order preserved.
 */
export function parseTagsParam(raw: string | null): string[] {
	if (!raw) return [];
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

export { DEFAULT_LIMIT, MAX_LIMIT };
