import { json, type RequestHandler } from '@sveltejs/kit';
import { cookieOptions, ID_TOKEN_COOKIE, SESSION_COOKIE } from '$lib/server/auth';
import { endSessionUrl } from '$lib/server/auth/oidc';

/**
 * Clearing our cookie only ends the local session — the IdP session would sign
 * the user straight back in on the next visit to /login. So the response hands
 * back where to go next: the provider's end-session endpoint when it has one.
 */
export const POST: RequestHandler = async ({ cookies, url }) => {
	// Read before deleting: the IdP needs it as `id_token_hint` to accept our
	// post-logout redirect.
	const idTokenHint = cookies.get(ID_TOKEN_COOKIE);

	// Same attributes as the set: SvelteKit defaults deletes to Secure, which
	// browsers drop over plain http, leaving the session cookie alive.
	cookies.delete(SESSION_COOKIE, cookieOptions());
	cookies.delete(ID_TOKEN_COOKIE, cookieOptions());

	// `?signedout` stops /login from immediately starting a new flow. Without it
	// the still-valid IdP session answers silently and the user is signed back
	// in — logging out of Tabula deliberately does not log them out of the IdP.
	const signedOut = new URL('/login?signedout', url.origin).toString();
	const redirectTo = await endSessionUrl(signedOut, idTokenHint).catch(() => null);

	return json({ ok: true, redirectTo: redirectTo ?? '/login?signedout' });
};
