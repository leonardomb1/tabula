import { sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import type { Access } from './access';
import { visibleDocs } from './visibility';
import {
	embedQuery,
	embeddingsConfigured,
	embeddingsModel,
	embeddingCast,
	embeddingColumn,
	literalDimensions
} from './semantic/embeddings';
import { ensureSemanticIndexer } from './semantic';

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

/** Reciprocal-rank fusion constant — the standard 60 from the RRF paper. */
const RRF_K = 60;
/** How deep each ranking contributes to the fusion. */
const FUSE_DEPTH = 30;

/**
 * Nearest chunks by cosine (HNSW), collapsed to their best-scoring document.
 * Same visibility predicate and workspace gate as the lexical query — a chunk
 * is never more visible than its document. Any failure (provider down, no
 * index yet) returns empty: semantic search sharpens lexical, never gates it.
 */
async function semanticDocRanking(
	q: string,
	gate: SQL,
	wsFilter: SQL
): Promise<SearchHit[]> {
	if (!embeddingsConfigured()) return [];
	try {
		const vec = await embedQuery(q);
		const dims = literalDimensions(vec);
		const col = sql.raw(`c.${embeddingColumn(dims)}`);
		const cast = sql.raw(embeddingCast(dims));
		const rows = await db.execute(sql`
			SELECT DISTINCT ON (docs.id)
				docs.id, workspace_id AS "workspaceId", slug, title, mode,
				is_public AS "isPublic", updated_at AS "updatedAt",
				1 - (${col} <=> ${vec}::${cast}) AS rank,
				left(c.content, 240) AS snippet
			FROM doc_chunks c
			JOIN docs ON docs.id = c.doc_id
			WHERE ${visibleDocs} AND ${gate} ${wsFilter}
				AND c.model = ${embeddingsModel()} AND ${col} IS NOT NULL
			ORDER BY docs.id, ${col} <=> ${vec}::${cast}
		`);
		return (rows as unknown as SearchHit[])
			.sort((a, b) => b.rank - a.rank)
			.slice(0, FUSE_DEPTH);
	} catch (err) {
		console.warn('semantic search unavailable:', err instanceof Error ? err.message : err);
		return [];
	}
}

/** RRF over the two rankings; each hit keeps the snippet of its better rank. */
function fuse(lexical: SearchHit[], semantic: SearchHit[], limit: number): SearchHit[] {
	const scores = new Map<string, { hit: SearchHit; score: number }>();
	for (const ranking of [lexical.slice(0, FUSE_DEPTH), semantic]) {
		ranking.forEach((hit, rank) => {
			const entry = scores.get(hit.id);
			const score = 1 / (RRF_K + rank + 1);
			if (entry) entry.score += score;
			else scores.set(hit.id, { hit, score });
		});
	}
	return [...scores.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ hit, score }) => ({ ...hit, rank: Math.round(score * 1000) / 1000 }));
}

function accessGate(access: Access): SQL {
	const ids = access.accessibleWorkspaceIds();
	const idArray = sql`array[${sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `
	)}]::text[]`;
	return access.principal.isPlatformAdmin
		? sql`true`
		: sql`(workspace_id = ANY(${idArray}) OR is_public = true)`;
}

export interface ChunkHit {
	id: string;
	workspaceId: string;
	slug: string;
	title: string;
	seq: number;
	content: string;
	similarity: number;
}

/**
 * Pure embedding search at chunk granularity — entry points for an agent
 * walking the document graph. Returns the matching chunk text itself, unlike
 * searchDocs which returns lexical headlines. Empty when embeddings are off.
 */
export async function searchChunks(
	access: Access,
	opts: { query: string; workspaceId?: string; limit?: number }
): Promise<ChunkHit[]> {
	ensureSemanticIndexer();
	const q = opts.query.trim();
	if (!q || !embeddingsConfigured()) return [];

	const limit = Math.min(opts.limit ?? 8, 20);
	const gate = accessGate(access);
	const wsFilter = opts.workspaceId ? sql`AND workspace_id = ${opts.workspaceId}` : sql``;
	try {
		const vec = await embedQuery(q);
		const dims = literalDimensions(vec);
		const col = sql.raw(`c.${embeddingColumn(dims)}`);
		const cast = sql.raw(embeddingCast(dims));
		const rows = await db.execute(sql`
			SELECT docs.id, workspace_id AS "workspaceId", slug, title, c.seq, c.content,
				round((1 - (${col} <=> ${vec}::${cast}))::numeric, 3)::float AS similarity
			FROM doc_chunks c
			JOIN docs ON docs.id = c.doc_id
			WHERE ${visibleDocs} AND ${gate} ${wsFilter}
				AND c.model = ${embeddingsModel()} AND ${col} IS NOT NULL
			ORDER BY ${col} <=> ${vec}::${cast}
			LIMIT ${limit}
		`);
		return rows as unknown as ChunkHit[];
	} catch (err) {
		console.warn('chunk search unavailable:', err instanceof Error ? err.message : err);
		return [];
	}
}

export async function searchDocs(access: Access, opts: SearchOptions): Promise<SearchHit[]> {
	ensureSemanticIndexer();
	const q = opts.query.trim();
	if (!q) return [];

	const limit = Math.min(opts.limit ?? 20, 100);
	const offset = opts.offset ?? 0;

	const gate = accessGate(access);
	const wsFilter = opts.workspaceId ? sql`AND workspace_id = ${opts.workspaceId}` : sql``;

	const ptq = sql`websearch_to_tsquery('public.pt_unaccent', ${q})`;
	const enq = sql`websearch_to_tsquery('public.en_unaccent', ${q})`;
	const tsq = sql`(${ptq} || ${enq})`;

	const meaningful = sql`numnode(${ptq}) > 0 AND numnode(${enq}) > 0`;

	// Lexical and semantic run concurrently; the page beyond the first stays
	// purely lexical, since RRF has no stable notion of an offset.
	const [primary, semantic] = await Promise.all([
		db.execute(sql`
			SELECT id, workspace_id AS "workspaceId", slug, title, mode,
				is_public AS "isPublic", updated_at AS "updatedAt",
				ts_rank_cd(search, ${tsq}) AS rank,
				ts_headline('public.pt_unaccent', body_text, ${tsq},
					'MaxFragments=2, MinWords=4, MaxWords=16, StartSel=<mark>, StopSel=</mark>') AS snippet
			FROM docs
			WHERE ${visibleDocs} AND ${gate} ${wsFilter} AND ${meaningful} AND search @@ ${tsq}
			ORDER BY rank DESC
			LIMIT ${limit} OFFSET ${offset}
		`),
		offset === 0 ? semanticDocRanking(q, gate, wsFilter) : Promise.resolve([])
	]);

	const rows = primary as unknown as SearchHit[];
	if (semantic.length > 0) return fuse(rows, semantic, limit);
	if (rows.length > 0) return rows;

	if (q.length < 3) return [];

	const fuzzy = await db.execute(sql`
		SELECT id, workspace_id AS "workspaceId", slug, title, mode,
			is_public AS "isPublic", updated_at AS "updatedAt",
			word_similarity(public.immutable_unaccent(${q}), public.immutable_unaccent(title)) AS rank,
			left(body_text, 160) AS snippet
		FROM docs
		WHERE ${visibleDocs} AND ${gate} ${wsFilter}
			AND public.immutable_unaccent(${q}) <% public.immutable_unaccent(title)
		ORDER BY rank DESC
		LIMIT ${limit} OFFSET ${offset}
	`);

	return fuzzy as unknown as SearchHit[];
}
