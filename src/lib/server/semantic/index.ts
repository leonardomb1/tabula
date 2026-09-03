/**
 * The semantic index: embedded chunks per document, kept current by a
 * background indexer — never on the request path, so a save costs what it
 * always cost and an Azure outage costs nothing but freshness.
 *
 * The staleness protocol is the `rev` column: a document counts as indexed
 * when chunks exist at its current rev under the current model. Everything
 * follows from that one predicate — backfill of a pre-existing corpus, re-embed
 * on edit, re-embed on model change, and cleanup after soft-delete or a doc
 * turning draft are all just "what the predicate says needs work". The indexer
 * ticks on an interval and is kicked after writes, so fresh edits index within
 * seconds while the steady state is one cheap no-op query per tick.
 *
 * Two replicas run this stack. Candidate selection takes a transaction-scoped
 * advisory try-lock (the pgbouncer-safe kind, same as the draft sweeper), so
 * ticks do not double-embed; the chunk write is guarded by a rev re-check, so
 * even a lost race converges rather than interleaving two revisions.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db';
import { docs, docChunks } from '../db/schema';
import { visibleDocs } from '../visibility';
import { chunkText } from './chunk';
import {
	embedTexts,
	embeddingsConfigured,
	embeddingsModel,
	embeddingCast,
	embeddingColumn,
	literalDimensions
} from './embeddings';

const TICK_MS = 60_000;
const KICK_DELAY_MS = 3_000;
/** Documents per tick — a large backfill drains over several ticks. */
const BATCH_DOCS = 8;
const LOCK_KEY = 0x7ab03a;

/** Chunks at the doc's rev under the current model = indexed. */
function needsWork(model: string) {
	return sql`not exists (
		select 1 from ${docChunks} c
		where c.doc_id = ${docs.id} and c.rev = ${docs.rev} and c.model = ${model}
	)`;
}

interface Candidate {
	id: string;
	rev: number;
	mode: string;
	source: string;
	bodyText: string;
}

/**
 * One pass: claim a batch, embed each document, write its chunks. Returns how
 * many documents were (re)indexed; 0 also covers "another replica holds the
 * lock", which is a normal outcome.
 */
export async function indexPendingDocs(): Promise<number> {
	if (!embeddingsConfigured()) return 0;
	const model = embeddingsModel();

	const candidates = await db.transaction(async (tx) => {
		const locked = (await tx.execute(
			sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as ok`
		)) as unknown as { ok: boolean }[];
		if (!locked[0]?.ok) return [] as Candidate[];

		// Orphaned chunks first: soft-deleted docs, docs that became drafts, and
		// leftovers from an abandoned model. Hard deletes cascade on their own.
		await tx.execute(sql`
			delete from ${docChunks}
			where ${docChunks.model} <> ${model}
				or ${docChunks.docId} in (
					select ${docs.id} from ${docs}
					where ${docs.deletedAt} is not null or ${docs.ephemeral}
				)
		`);

		return (await tx.execute(sql`
			select ${docs.id} as id, ${docs.rev} as rev, ${docs.mode} as mode,
				${docs.source} as source, ${docs.bodyText} as "bodyText"
			from ${docs}
			where ${visibleDocs} and ${needsWork(model)}
				and length(btrim(${docs.source})) > 0
			order by ${docs.updatedAt} desc
			limit ${BATCH_DOCS}
		`)) as unknown as Candidate[];
	});

	let done = 0;
	for (const doc of candidates) {
		// Markdown keeps its heading structure; typst embeds the extracted text,
		// falling back to raw source for a doc saved before extraction existed.
		const text = doc.mode === 'markdown' ? doc.source : doc.bodyText || doc.source;
		const chunks = chunkText(text);
		if (chunks.length === 0) continue;

		const vectors = await embedTexts(chunks);
		// Column dispatch by the model's actual output size — whitelisted, so
		// the raw interpolation below can only ever name a real column.
		const dims = literalDimensions(vectors[0]);
		const column = sql.raw(embeddingColumn(dims));
		const cast = sql.raw(embeddingCast(dims));

		await db.transaction(async (tx) => {
			// The doc may have moved on while Azure worked; writing would stamp
			// stale chunks with a rev they don't match. Skip — the next tick sees
			// the new rev.
			const fresh = (await tx.execute(
				sql`select ${docs.rev} as rev from ${docs} where ${docs.id} = ${doc.id} for update`
			)) as unknown as { rev: number }[];
			if (fresh[0]?.rev !== doc.rev) return;

			await tx.execute(sql`delete from ${docChunks} where ${docChunks.docId} = ${doc.id}`);
			for (let i = 0; i < chunks.length; i++) {
				await tx.execute(sql`
					insert into ${docChunks} (doc_id, seq, rev, model, content, ${column})
					values (${doc.id}, ${i}, ${doc.rev}, ${model}, ${chunks[i]}, ${vectors[i]}::${cast})
				`);
			}
		});
		done++;
	}
	return done;
}

let timer: ReturnType<typeof setInterval> | null = null;
let kickTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function tick(): Promise<void> {
	if (running) return;
	running = true;
	try {
		// Drain: a backfill should not wait a minute between batches.
		while ((await indexPendingDocs()) > 0);
	} catch (err) {
		console.warn('semantic index tick failed:', err instanceof Error ? err.message : err);
	} finally {
		running = false;
	}
}

/** Lazy start, same shape as the draft sweeper — no init hook to wire up. */
export function ensureSemanticIndexer(): void {
	if (timer || !embeddingsConfigured()) return;
	timer = setInterval(() => void tick(), TICK_MS);
	void tick();
}

/**
 * Nudge the indexer shortly after a write, debounced so a burst of saves (an
 * agent patching a draft it then promotes) costs one pass, not one per save.
 */
export function kickSemanticIndexer(): void {
	if (!embeddingsConfigured()) return;
	ensureSemanticIndexer();
	if (kickTimer) clearTimeout(kickTimer);
	kickTimer = setTimeout(() => void tick(), KICK_DELAY_MS);
}
