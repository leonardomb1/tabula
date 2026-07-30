import { sql } from 'drizzle-orm';
import { db } from './db';
import type { Access } from './access';

export interface SearchOptions {
	query: string;
	workspaceId?: string;
	limit?: number;
	offset?: number;
}

export interface SearchHit {
	id: string;
	workspaceId: string;
	slug: string;
	title: string;
	mode: 'markdown' | 'typst';
	isPublic: boolean;
	updatedAt: Date;
	rank: number;
	snippet: string;
}

export async function searchDocs(access: Access, opts: SearchOptions): Promise<SearchHit[]> {
	const q = opts.query.trim();
	if (!q) return [];

	const limit = Math.min(opts.limit ?? 20, 100);
	const offset = opts.offset ?? 0;

	const ids = access.accessibleWorkspaceIds();
	const idArray = sql`array[${sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `
	)}]::text[]`;
	const gate = access.principal.isPlatformAdmin
		? sql`true`
		: sql`(workspace_id = ANY(${idArray}) OR is_public = true)`;
	const wsFilter = opts.workspaceId ? sql`AND workspace_id = ${opts.workspaceId}` : sql``;

	const ptq = sql`websearch_to_tsquery('public.pt_unaccent', ${q})`;
	const enq = sql`websearch_to_tsquery('public.en_unaccent', ${q})`;
	const tsq = sql`(${ptq} || ${enq})`;

	const meaningful = sql`numnode(${ptq}) > 0 AND numnode(${enq}) > 0`;

	const primary = await db.execute(sql`
		SELECT id, workspace_id AS "workspaceId", slug, title, mode,
			is_public AS "isPublic", updated_at AS "updatedAt",
			ts_rank_cd(search, ${tsq}) AS rank,
			ts_headline('public.pt_unaccent', body_text, ${tsq},
				'MaxFragments=2, MinWords=4, MaxWords=16, StartSel=<mark>, StopSel=</mark>') AS snippet
		FROM docs
		WHERE deleted_at IS NULL AND ${gate} ${wsFilter} AND ${meaningful} AND search @@ ${tsq}
		ORDER BY rank DESC
		LIMIT ${limit} OFFSET ${offset}
	`);

	const rows = primary as unknown as SearchHit[];
	if (rows.length > 0) return rows;

	if (q.length < 3) return [];

	const fuzzy = await db.execute(sql`
		SELECT id, workspace_id AS "workspaceId", slug, title, mode,
			is_public AS "isPublic", updated_at AS "updatedAt",
			word_similarity(public.immutable_unaccent(${q}), public.immutable_unaccent(title)) AS rank,
			left(body_text, 160) AS snippet
		FROM docs
		WHERE deleted_at IS NULL AND ${gate} ${wsFilter}
			AND public.immutable_unaccent(${q}) <% public.immutable_unaccent(title)
		ORDER BY rank DESC
		LIMIT ${limit} OFFSET ${offset}
	`);

	return fuzzy as unknown as SearchHit[];
}
