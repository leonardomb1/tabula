/// <reference types="@cloudflare/workers-types" />
/**
 * Cloudflare Worker entry. Forwards every request to a single Bun
 * container instance that runs the SvelteKit app.
 *
 * Env bindings / secrets set at the Worker level (via wrangler.toml and
 * `wrangler secret put`) are passed through to the container as env vars
 * on first start — the app reads them via `$env/dynamic/private`.
 */
import { Container } from '@cloudflare/containers';

interface Env {
	DOCS: DurableObjectNamespace<Docs>;
	// All app-level env vars are optional here; Container forwards whatever
	// is present as process.env inside the image.
	[key: string]: unknown;
}

export class Docs extends Container<Env> {
	defaultPort = 3000;
	/** Stop the container after 10 minutes of idle. First request after
	 *  idle pays a ~1-3s cold-start. Set to 0 or increase for always-warm. */
	sleepAfter = '10m';

	// ctx is typed loosely because `DurableObject['ctx']` uses a generic the
	// public types don't surface cleanly; the runtime passes the right thing.
	constructor(ctx: DurableObjectState<object>, env: Env) {
		super(ctx, env);

		// Forward every string-valued binding to the container. Non-string
		// bindings (DO namespaces, R2 buckets, etc.) are filtered out.
		const forwarded: Record<string, string> = {};
		for (const [key, value] of Object.entries(env)) {
			if (typeof value === 'string') forwarded[key] = value;
		}
		forwarded.NODE_ENV ??= 'production';
		forwarded.PORT ??= String(this.defaultPort);
		this.envVars = forwarded;
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const t0 = Date.now();
		const url = new URL(request.url);
		const isExport = url.pathname.startsWith('/api/export/');

		const id = env.DOCS.idFromName('main');
		const stub = env.DOCS.get(id);

		if (isExport) console.log(`[worker→container] ${request.method} ${url.pathname}${url.search} start`);

		try {
			const response = await stub.fetch(request);
			if (isExport)
				console.log(
					`[worker→container] ${request.method} ${url.pathname} ${response.status} in ${Date.now() - t0}ms`
				);
			return response;
		} catch (err) {
			const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
			console.error(`[worker→container] ${request.method} ${url.pathname} FAILED in ${Date.now() - t0}ms — ${msg}`);
			throw err;
		}
	}
};
