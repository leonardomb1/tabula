/**
 * Applies drizzle/*.sql in filename order, recording each in _tabula_migrations.
 *
 * drizzle-kit push cannot bootstrap this schema (docs.search depends on
 * hand-written functions and text-search configs it does not know about), so the
 * files are applied directly. 0000_init.sql is the whole schema and is
 * idempotent: it converges any database — fresh, current, or one built by the
 * old split migrations — so first contact needs no adoption step. Files added
 * after it run once and are tracked; an advisory lock serializes concurrent runs.
 *
 *   bun run scripts/migrate.ts             apply anything not yet recorded
 *   bun run scripts/migrate.ts status      list applied / pending
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const DIR = process.env.MIGRATIONS_DIR || 'drizzle';
const command = process.argv[2] ?? 'apply';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
if (process.env.PGBOUNCER === 'true') {
	console.error('refusing to migrate through a transaction pooler; point DATABASE_URL at Postgres directly');
	process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function files(): Promise<string[]> {
	const all = await readdir(DIR);
	return all.filter((f) => f.endsWith('.sql')).sort();
}

async function applied(): Promise<Set<string>> {
	await sql`
		CREATE TABLE IF NOT EXISTS _tabula_migrations (
			filename text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`;
	const rows = await sql<{ filename: string }[]>`SELECT filename FROM _tabula_migrations`;
	return new Set(rows.map((r) => r.filename));
}

const LOCK_KEY = 0x7ab01a; // arbitrary app-wide constant; released when the connection closes

try {
	await sql`SELECT pg_advisory_lock(${LOCK_KEY})`;
	const pending = await files();
	const done = await applied();

	if (command === 'status') {
		for (const f of pending) console.log(`${done.has(f) ? 'applied ' : 'pending '} ${f}`);
		process.exit(0);
	}

	let count = 0;
	for (const f of pending) {
		if (done.has(f)) continue;
		const text = await readFile(join(DIR, f), 'utf8');
		await sql.begin(async (tx) => {
			await tx.unsafe(text);
			await tx`INSERT INTO _tabula_migrations (filename) VALUES (${f})`;
		});
		console.log(`applied ${f}`);
		count++;
	}
	console.log(count ? `${count} migration(s) applied` : 'already up to date');
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
} finally {
	await sql.end();
}
