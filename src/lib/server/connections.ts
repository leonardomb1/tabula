/**
 * The connections a document has to the rest of the workspace: backlinks with
 * the sentence around each mention, semantically related documents from the
 * chunk embeddings, title mentions that never became links, and the local link
 * graph. Everything here goes through `visibleDocs`; callers still apply
 * per-viewer access filtering (public docs can be read across workspaces).
 */

import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from './db';
import { docLinks, docs, type Doc } from './db/schema';
import { visibleDocs } from './visibility';
import { embeddingsConfigured, embeddingsModel } from './semantic/embeddings';

export interface DocConnection {
	id: string;
	slug: string;
	title: string;
	workspaceId: string;
	isPublic: boolean;
	excerpt?: string;
	/** Cosine similarity in [0, 1]; only on embedding-derived connections. */
	similarity?: number;
}

export interface GraphNode {
	id: string;
	slug: string;
	title: string;
	workspaceId: string;
	isPublic: boolean;
	center: boolean;
}

export interface GraphEdge {
	source: string;
	target: string;
}

const EXCERPT_RADIUS = 110;

/** A readable one-line snippet around `index`, markdown noise stripped. */
export function excerptAround(text: string, index: number, matchLength: number): string {
	const start = Math.max(0, index - EXCERPT_RADIUS);
	const end = Math.min(text.length, index + matchLength + EXCERPT_RADIUS);
	let s = text.slice(start, end);
	s = s
		.replace(/\[\[([^\]|]+)\|([^\]]*)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/[*_`>|]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return `${start > 0 ? '…' : ''}${s}${end < text.length ? '…' : ''}`;
}

/** Backlinks plus the snippet around the first mention in each source doc. */
export async function getBacklinksWithContext(doc: {
	id: string;
	slug: string;
	workspaceId: string;
}): Promise<DocConnection[]> {
	const rows = await db
		.select({ doc: docs, targetSlug: docLinks.targetSlug })
		.from(docLinks)
		.innerJoin(docs, eq(docs.id, docLinks.sourceDocId))
		.where(
			and(
				visibleDocs,
				or(
					eq(docLinks.targetDocId, doc.id),
					and(eq(docLinks.targetSlug, doc.slug), eq(docs.workspaceId, doc.workspaceId))
				)
			)
		);

	const seen = new Map<string, DocConnection>();
	for (const { doc: source, targetSlug } of rows) {
		if (seen.has(source.id)) continue;
		let excerpt = '';
		for (const needle of [`[[${targetSlug}`, `[[${doc.slug}`, `[[${doc.id}`]) {
			const i = source.source.indexOf(needle);
			if (i >= 0) {
				excerpt = excerptAround(source.source, i, needle.length);
				break;
			}
		}
		seen.set(source.id, {
			id: source.id,
			slug: source.slug,
			title: source.title,
			workspaceId: source.workspaceId,
			isPublic: source.isPublic,
			excerpt
		});
	}
	return [...seen.values()];
}

/** Outgoing wikilinks plus the snippet around each link in this doc's source. */
export async function getOutgoingLinks(doc: Doc): Promise<DocConnection[]> {
	const rows = await db
		.select({ doc: docs, targetSlug: docLinks.targetSlug })
		.from(docLinks)
		.innerJoin(docs, eq(docs.id, docLinks.targetDocId))
		.where(and(eq(docLinks.sourceDocId, doc.id), visibleDocs));

	const seen = new Map<string, DocConnection>();
	for (const { doc: target, targetSlug } of rows) {
		if (seen.has(target.id)) continue;
		let excerpt = '';
		for (const needle of [`[[${targetSlug}`, `[[${target.slug}`, `[[${target.id}`]) {
			const i = doc.source.indexOf(needle);
			if (i >= 0) {
				excerpt = excerptAround(doc.source, i, needle.length);
				break;
			}
		}
		seen.set(target.id, {
			id: target.id,
			slug: target.slug,
			title: target.title,
			workspaceId: target.workspaceId,
			isPublic: target.isPublic,
			excerpt
		});
	}
	return [...seen.values()];
}

/** Similar chunk distances aggregated per doc; empty when unindexed. */
export async function getRelatedDocs(
	doc: Pick<Doc, 'id' | 'workspaceId'>,
	limit = 5
): Promise<DocConnection[]> {
	if (!embeddingsConfigured()) return [];
	const model = embeddingsModel();
	try {
		// No alias on docs: visibleDocs qualifies its columns as "docs".
		const rows = (await db.execute(sql`
			with centroid as (
				select avg(embedding) as emb
				from doc_chunks
				where doc_id = ${doc.id} and model = ${model}
			)
			select docs.id, docs.slug, docs.title, docs.workspace_id as "workspaceId",
				docs.is_public as "isPublic",
				min(c.embedding <=> (select emb from centroid)) as dist,
				round((1 - min(c.embedding <=> (select emb from centroid)))::numeric, 3)::float as similarity
			from doc_chunks c
			join docs on docs.id = c.doc_id
			where c.model = ${model}
				and c.doc_id <> ${doc.id}
				and docs.workspace_id = ${doc.workspaceId}
				and ${visibleDocs}
				and (select emb from centroid) is not null
			group by docs.id, docs.slug, docs.title, docs.workspace_id, docs.is_public
			having min(c.embedding <=> (select emb from centroid)) < 0.65
			order by dist asc
			limit ${limit}
		`)) as unknown as DocConnection[];
		return rows;
	} catch (err) {
		console.warn('related docs unavailable:', err instanceof Error ? err.message : err);
		return [];
	}
}

/** Docs whose text mentions this doc's title but never link to it. */
export async function getUnlinkedMentions(doc: Doc, limit = 5): Promise<DocConnection[]> {
	const title = doc.title.trim();
	// Short titles match everything; not worth the noise.
	if (title.length < 6) return [];

	const rows = await db
		.select()
		.from(docs)
		.where(
			and(
				eq(docs.workspaceId, doc.workspaceId),
				ne(docs.id, doc.id),
				visibleDocs,
				sql`${docs.bodyText} ilike ${'%' + title + '%'}`,
				sql`not exists (
					select 1 from ${docLinks} l
					where l.source_doc_id = ${docs.id}
						and (l.target_doc_id = ${doc.id} or l.target_slug = ${doc.slug})
				)`
			)
		)
		.limit(limit);

	return rows.map((source) => {
		const i = source.bodyText.toLowerCase().indexOf(title.toLowerCase());
		return {
			id: source.id,
			slug: source.slug,
			title: source.title,
			workspaceId: source.workspaceId,
			isPublic: source.isPublic,
			excerpt: i >= 0 ? excerptAround(source.bodyText, i, title.length) : ''
		};
	});
}

const WORKSPACE_GRAPH_CAP = 150;

/** Every visible doc in the workspace (recency-capped) and the links among them. */
export async function getWorkspaceGraph(
	workspaceId: string,
	cap = WORKSPACE_GRAPH_CAP
): Promise<{ nodes: { id: string; slug: string; title: string }[]; edges: GraphEdge[] }> {
	const nodes = await db
		.select({ id: docs.id, slug: docs.slug, title: docs.title })
		.from(docs)
		.where(and(eq(docs.workspaceId, workspaceId), visibleDocs))
		.orderBy(desc(docs.updatedAt))
		.limit(cap);
	if (nodes.length === 0) return { nodes: [], edges: [] };

	const ids = nodes.map((n) => n.id);
	const edgeRows = await db
		.select({ source: docLinks.sourceDocId, target: docLinks.targetDocId })
		.from(docLinks)
		.where(and(inArray(docLinks.sourceDocId, ids), inArray(docLinks.targetDocId, ids)));

	const seen = new Set<string>();
	const edges: GraphEdge[] = [];
	for (const e of edgeRows) {
		if (!e.target || e.source === e.target) continue;
		const key = `${e.source}→${e.target}`;
		if (seen.has(key)) continue;
		seen.add(key);
		edges.push({ source: e.source, target: e.target });
	}
	return { nodes, edges };
}

const GRAPH_NODE_CAP = 24;

/** One hop of links in both directions, plus the edges among those neighbors. */
export async function getLocalGraph(doc: Doc): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
	const [incoming, outgoing] = await Promise.all([
		db
			.select({ doc: docs })
			.from(docLinks)
			.innerJoin(docs, eq(docs.id, docLinks.sourceDocId))
			.where(
				and(
					visibleDocs,
					or(
						eq(docLinks.targetDocId, doc.id),
						and(eq(docLinks.targetSlug, doc.slug), eq(docs.workspaceId, doc.workspaceId))
					)
				)
			),
		db
			.select({ doc: docs })
			.from(docLinks)
			.innerJoin(docs, eq(docs.id, docLinks.targetDocId))
			.where(and(eq(docLinks.sourceDocId, doc.id), visibleDocs))
	]);

	const nodes = new Map<string, GraphNode>();
	nodes.set(doc.id, {
		id: doc.id,
		slug: doc.slug,
		title: doc.title,
		workspaceId: doc.workspaceId,
		isPublic: doc.isPublic,
		center: true
	});
	for (const { doc: d } of [...incoming, ...outgoing]) {
		if (nodes.size >= GRAPH_NODE_CAP) break;
		if (!nodes.has(d.id)) {
			nodes.set(d.id, {
				id: d.id,
				slug: d.slug,
				title: d.title,
				workspaceId: d.workspaceId,
				isPublic: d.isPublic,
				center: false
			});
		}
	}

	const ids = [...nodes.keys()];
	if (ids.length < 2) return { nodes: [...nodes.values()], edges: [] };

	const edgeRows = await db
		.select({ source: docLinks.sourceDocId, target: docLinks.targetDocId })
		.from(docLinks)
		.where(and(inArray(docLinks.sourceDocId, ids), inArray(docLinks.targetDocId, ids)));

	const seen = new Set<string>();
	const edges: GraphEdge[] = [];
	for (const e of edgeRows) {
		if (!e.target || e.source === e.target) continue;
		const key = `${e.source}→${e.target}`;
		if (seen.has(key)) continue;
		seen.add(key);
		edges.push({ source: e.source, target: e.target });
	}
	return { nodes: [...nodes.values()], edges };
}
