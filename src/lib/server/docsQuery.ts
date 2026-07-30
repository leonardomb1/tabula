import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { docs } from './db/schema';
import {
	DEFAULT_LIMIT,
	MAX_LIMIT,
	parseLimit,
	parseSort,
	parseTagsParam,
	type DocsPage,
	type SortMode,
	type TagCount
} from '../docs';

function textArray(values: string[]): SQL {
	return sql`array[${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `
	)}]::text[]`;
}

function scope(workspaceId: string, tags: string[]) {
	const parts = [eq(docs.workspaceId, workspaceId), isNull(docs.deletedAt)];
	if (tags.length > 0) parts.push(sql`${docs.tags} @> ${textArray(tags)}`);
	return and(...parts);
}

export async function listDocsPage(
	workspaceId: string,
	opts: { tags?: string[]; sort?: SortMode; limit?: number } = {}
): Promise<DocsPage> {
	const tags = opts.tags ?? [];
	const sort = opts.sort ?? 'recent';
	const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const where = scope(workspaceId, tags);

	const [rows, totals] = await Promise.all([
		db
			.select({
				id: docs.id,
				slug: docs.slug,
				title: docs.title,
				mode: docs.mode,
				tags: docs.tags,
				isPublic: docs.isPublic,
				updatedAt: docs.updatedAt,
				excerpt: sql<string>`left(${docs.bodyText}, 220)`
			})
			.from(docs)
			.where(where)
			.orderBy(sort === 'alpha' ? asc(docs.title) : desc(docs.updatedAt))
			.limit(limit),
		db.select({ total: sql<number>`count(*)::int` }).from(docs).where(where)
	]);

	const total = totals[0]?.total ?? 0;
	return { docs: rows, total, limit, hasMore: rows.length < total };
}

export async function listTagCounts(workspaceId: string): Promise<TagCount[]> {
	const rows = await db.execute(sql`
		SELECT tag, count(*)::int AS count
		FROM ${docs}, unnest(${docs.tags}) AS tag
		WHERE ${docs.workspaceId} = ${workspaceId} AND ${docs.deletedAt} IS NULL
		GROUP BY tag
		ORDER BY count DESC, tag ASC
	`);
	return rows as unknown as TagCount[];
}

export async function loadIndexData(workspaceId: string, url: URL) {
	const tags = parseTagsParam(url.searchParams.get('tags'));
	const sort = parseSort(url.searchParams.get('sort'));
	const limit = parseLimit(url.searchParams.get('limit'));
	const page = await listDocsPage(workspaceId, { tags, sort, limit });
	return { page, tags, sort };
}
