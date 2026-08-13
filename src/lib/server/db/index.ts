/**
 * The Postgres client, connected on first use rather than at import. Building the
 * app imports every server module, so an eager connection would make DATABASE_URL
 * a build-time requirement — which it is not.
 *
 * Set `PGBOUNCER=true` when DATABASE_URL points at a transaction-pooling proxy:
 * named prepared statements do not survive a pooler reassigning the server
 * connection between statements. Migrations must connect directly, not pooled.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = PostgresJsDatabase<typeof schema>;

let instance: Db | undefined;

function connect(): Db {
	if (instance) return instance;

	const url = process.env.DATABASE_URL;
	if (!url) throw new Error('DATABASE_URL is not set');

	const pooled = process.env.PGBOUNCER === 'true';
	const client = postgres(url, {
		prepare: !pooled,
		max: Number(process.env.DATABASE_POOL_MAX || 10),
		idle_timeout: Number(process.env.DATABASE_IDLE_TIMEOUT || 30),
		connect_timeout: Number(process.env.DATABASE_CONNECT_TIMEOUT || 10),
		onnotice: (notice) => {
			if (notice.routine === 'cleanup_tsquery_stopwords') return;
			console.warn(`postgres ${notice.severity}: ${notice.message}`);
		}
	});

	instance = drizzle(client, { schema });
	return instance;
}

export const db: Db = new Proxy({} as Db, {
	get(_target, prop) {
		const target = connect() as unknown as Record<string | symbol, unknown>;
		const value = target[prop];
		return typeof value === 'function' ? value.bind(target) : value;
	},
	has(_target, prop) {
		return prop in (connect() as object);
	}
});
