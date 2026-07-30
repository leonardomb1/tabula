import { json, type RequestHandler } from '@sveltejs/kit';
import { cookieOptions, SESSION_COOKIE } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	// Same attributes as the set: SvelteKit defaults deletes to Secure, which
	// browsers drop over plain http, leaving the session cookie alive.
	cookies.delete(SESSION_COOKIE, cookieOptions());
	return json({ ok: true });
};
