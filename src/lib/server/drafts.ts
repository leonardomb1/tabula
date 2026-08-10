/**
 * Ephemeral agent drafts: the disposable side of the doc store. An agent creates
 * a draft, patches it in place until it compiles, and either promotes it (see
 * promoteDoc in ./docs) or lets it expire.
 *
 * Everything here is about the parts of a draft's life a normal doc doesn't have:
 * listing the ones a user can still rescue, and deleting the ones nobody did.
 */

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { docs } from './db/schema';
import { draftDocs } from './visibility';
import { DocNotFoundError } from './docs';

/**
 * Measured from `updated_at`, which every patch touches, so a draft someone is
 * actively working on never expires mid-edit. Matches the retention window on
 * PerguntAI's export store, so both halves of one artifact age out together.
 */
export const DRAFT_TTL_DAYS = 7;

/** Bounds a single sweep so a large backlog drains over several ticks. */
const SWEEP_BATCH = 500;
const SWEEP_MS = 60 * 60 * 1000;

/**
 * Distinct from the migration runner's key (scripts/migrate.ts). Transaction-
 * scoped rather than session-scoped: the app connects through pgbouncer in
 * transaction-pooling mode (PGBOUNCER=true), where a session lock can outlive
 * the client that took it because the server connection gets reassigned. An
 * xact lock is released at commit, and transaction pooling pins one server
 * connection for the whole transaction, which is exactly the guarantee needed.
 */
const SWEEP_LOCK_KEY = 0x7ab02a;

export interface DraftSummary {
	id: string;
	slug: string;
	title: string;
	mode: 'markdown' | 'typst';
	origin: string | null;
	chars: number;
	updatedAt: Date;
	expiresAt: Date;
	/** True once a previous source exists, i.e. the draft has been patched at least once. */
	undoable: boolean;
}

function expiryOf(updatedAt: Date): Date {
	return new Date(updatedAt.getTime() + DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Live drafts in a workspace, newest first. Nothing else lists these. */
export async function listDrafts(workspaceId: string): Promise<DraftSummary[]> {
	ensureDraftSweeper();
	const rows = await db
		.select({
			id: docs.id,
			slug: docs.slug,
			title: docs.title,
			mode: docs.mode,
			origin: docs.origin,
			chars: sql<number>`length(${docs.source})::int`,
			updatedAt: docs.updatedAt,
			prevSource: docs.prevSource
		})
		.from(docs)
		.where(and(eq(docs.workspaceId, workspaceId), draftDocs))
		.orderBy(asc(docs.updatedAt));

	return rows.map(({ prevSource, ...r }) => ({
		...r,
		expiresAt: expiryOf(r.updatedAt),
		undoable: prevSource !== null
	}));
}

/**
 * Throw a draft away now. Hard delete, not soft: doc_versions and doc_links
 * cascade, and a soft delete would only move the accumulation problem into
 * deleted_at rows. Refuses anything that is not a draft, so this can never be
 * pointed at a real document.
 */
export async function discardDraft(id: string): Promise<void> {
	const [gone] = await db
		.delete(docs)
		.where(and(eq(docs.id, id), eq(docs.ephemeral, true)))
		.returning({ id: docs.id });
	if (!gone) throw new DocNotFoundError(id);
}

/**
 * Delete drafts past their TTL. Returns how many went.
 *
 * Two replicas run this stack, so the lock is load-bearing rather than defensive:
 * without it both instances scan and delete the same batch every tick, and one of
 * them does all its work for nothing. Not acquiring the lock is a normal outcome
 * — the other instance is already sweeping — so it returns 0 rather than raising.
 */
export async function sweepExpiredDrafts(): Promise<number> {
	return db.transaction(async (tx) => {
		const locked = (await tx.execute(
			sql`select pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) as ok`
		)) as unknown as { ok: boolean }[];
		if (!locked[0]?.ok) return 0;

		const deleted = (await tx.execute(sql`
			delete from ${docs}
			where ${docs.id} in (
				select ${docs.id} from ${docs}
				where ${docs.ephemeral}
					and ${docs.deletedAt} is null
					and ${docs.updatedAt} < now() - make_interval(days => ${DRAFT_TTL_DAYS})
				order by ${docs.updatedAt}
				limit ${SWEEP_BATCH}
			)
			returning ${docs.id}
		`)) as unknown as { id: string }[];

		return deleted.length;
	});
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the sweep on first contact with the draft system, the same lazy shape
 * ./views uses for its flush timer — an instance that never touches drafts never
 * starts a timer, and there is no init hook to wire up.
 */
export function ensureDraftSweeper(): void {
	if (timer) return;
	timer = setInterval(() => {
		void sweepExpiredDrafts().catch((err) => {
			// A failed sweep is retried on the next tick; drafts expiring late is
			// not worth taking a request path down for.
			console.warn('draft sweep failed:', err instanceof Error ? err.message : err);
		});
	}, SWEEP_MS);
	timer.unref?.();
}
