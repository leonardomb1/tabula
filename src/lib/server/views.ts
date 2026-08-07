/**
 * Daily view counters, buffered in memory per instance and flushed on an
 * interval so anonymous-scale traffic costs one upsert per doc per flush.
 * No cookies, no identities — counts only.
 */

import { sql } from 'drizzle-orm';
import { db } from './db';

export type ViewSource = 'app' | 'wiki';

const FLUSH_MS = 15_000;
const buffer = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

async function flush(): Promise<void> {
	if (buffer.size === 0) return;
	const entries = [...buffer.entries()];
	buffer.clear();
	for (const [key, count] of entries) {
		const [docId, day, source] = key.split('|');
		try {
			await db.execute(sql`
				INSERT INTO doc_view_daily (doc_id, day, source, count)
				VALUES (${docId}, ${day}::date, ${source}, ${count})
				ON CONFLICT (doc_id, day, source) DO UPDATE SET count = doc_view_daily.count + ${count}`);
		} catch {
			// A failed flush drops those counts; views are best-effort.
		}
	}
}

export function recordView(docId: string, source: ViewSource): void {
	const key = `${docId}|${today()}|${source}`;
	buffer.set(key, (buffer.get(key) ?? 0) + 1);
	if (!timer) {
		timer = setInterval(() => void flush(), FLUSH_MS);
		timer.unref?.();
	}
}

export interface ViewCountOptions {
	/** Restrict to one surface. Omit to combine app and wiki reads. */
	source?: ViewSource;
	/** Trailing window in days. Omit for the all-time total. */
	days?: number;
}

/**
 * Views per doc. All-time by default: a windowed number shown as a plain total
 * shrinks as old days age out, which reads as the counter losing views.
 */
export async function viewCounts(
	docIds: string[],
	opts: ViewCountOptions = {}
): Promise<Map<string, number>> {
	if (docIds.length === 0) return new Map();
	const idList = sql.join(
		docIds.map((id) => sql`${id}`),
		sql`, `
	);
	const since =
		opts.days === undefined ? sql`` : sql` AND day >= current_date - ${opts.days}::int`;
	const source = opts.source === undefined ? sql`` : sql` AND source = ${opts.source}`;
	const rows = (await db.execute(sql`
		SELECT doc_id, sum(count)::int AS total
		FROM doc_view_daily
		WHERE doc_id IN (${idList})${since}${source}
		GROUP BY doc_id`)) as unknown as { doc_id: string; total: number }[];
	return new Map(rows.map((r) => [r.doc_id, r.total]));
}
