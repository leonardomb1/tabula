import { hostname } from 'node:os';
import { sql } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';

/** Container id behind the load balancer, so a reply can be traced to an instance. */
const instance = process.env.INSTANCE_NAME || hostname();

/**
 * Liveness by default, so a database blip does not pull every instance out of the
 * load balancer at once and turn a degraded service into an outage. `?deep=1`
 * additionally pings Postgres, for readiness gates and manual checks.
 */
export const GET: RequestHandler = async ({ url, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store' });

	if (url.searchParams.get('deep') !== '1') return json({ ok: true, instance });

	try {
		await db.execute(sql`select 1`);
		return json({ ok: true, instance, db: 'up' });
	} catch (err) {
		return json({ ok: false, instance, db: err instanceof Error ? err.message : 'down' }, { status: 503 });
	}
};
