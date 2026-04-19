/// <reference types="bun-types" />
/**
 * Seed the default workspace on a fresh database. Idempotent — re-running
 * just upserts. Creates one team "Geral" with a wildcard→editor binding,
 * matching the behavior of a brand-new installation.
 *
 * Additional workspaces are created through the admin UI at
 * /settings/platform; there's nothing else to seed here.
 *
 * Run with `bun db/seed-workspaces.ts`.
 */
export {};

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = new Bun.SQL(DB_URL);

await sql.begin(async (tx: Bun.TransactionSQL) => {
	await tx`
		INSERT INTO workspaces (id, name)
		VALUES ('default', 'Geral')
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			updated_at = now()
	`;

	await tx`
		INSERT INTO workspace_bindings (workspace_id, source, source_value, role, created_by)
		VALUES ('default', 'wildcard', '*', 'editor', 'seed')
		ON CONFLICT (workspace_id, source, source_value) DO NOTHING
	`;
});

console.log('default workspace seeded.');
await sql.end();
