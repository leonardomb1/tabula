/// <reference types="bun-types" />
/**
 * Minimal migration runner. Reads every .sql file in db/migrations in
 * filename order, tracks applied ones in schema_migrations, and runs
 * each unapplied migration inside a single transaction.
 *
 * Run with `bun db/migrate.ts`. Safe to re-run; applied migrations
 * are skipped.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = new Bun.SQL(url);

await sql`
	CREATE TABLE IF NOT EXISTS schema_migrations (
		filename    TEXT PRIMARY KEY,
		applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
	)
`;

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'migrations');
const files = readdirSync(dir)
	.filter((f) => f.endsWith('.sql'))
	.sort();

const appliedRows = await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
const applied = new Set(appliedRows.map((r) => r.filename));

let ran = 0;
for (const f of files) {
	if (applied.has(f)) {
		console.log(`· skip ${f}`);
		continue;
	}
	const body = readFileSync(join(dir, f), 'utf8');
	console.log(`→ apply ${f}`);
	await sql.begin(async (tx: Bun.TransactionSQL) => {
		await tx.unsafe(body);
		await tx`INSERT INTO schema_migrations (filename) VALUES (${f})`;
	});
	ran++;
}

console.log(`done (${ran} applied, ${applied.size} already in place).`);
await sql.end();
