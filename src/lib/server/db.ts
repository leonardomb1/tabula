/**
 * Postgres client — Bun's pre-wired `Bun.sql` global. Reads DATABASE_URL
 * automatically, connection pool managed by Bun. See:
 *   https://bun.sh/docs/api/sql
 *
 * We reference the global rather than `import { sql } from 'bun'` so neither
 * Vite nor svelte-adapter-bun's downstream Rollup pass tries to resolve
 * "bun" at build time. Everything runs under Bun (see the `--bun` flag in
 * package.json scripts), so the global is always defined at module load.
 *
 * Run migrations with `bun db/migrate.ts`.
 */
export const sql = Bun.sql;
