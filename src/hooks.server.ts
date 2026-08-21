import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { cookieOptions, SESSION_COOKIE, userFromClaims, verifySession } from '$lib/server/auth';
import { isBlocked } from '$lib/server/gate';
import { loadAccess } from '$lib/server/access';
import { ensureSemanticIndexer } from '$lib/server/semantic';
import { directoryClaimsFor } from '$lib/server/userSettings';

/**
 * Unexpected failures only. Thrown HTTP errors (`error(404, …)`) never reach here,
 * so their own messages still show. The stack is logged with a short id and the
 * client gets only that id, which keeps internals out of the page while leaving
 * something to match against in the logs.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = crypto.randomUUID().slice(0, 8);
	console.error(`[${id}] ${status} ${event.request.method} ${event.url.pathname}`, error);
	return { message, id };
};

const originalHandle: Handle = async ({ event, resolve }) => {
	// No init hook exists; first request starts the background indexer (no-op
	// per request after that, and entirely absent without EMBEDDINGS_BASE_URL).
	ensureSemanticIndexer();

	const token = event.cookies.get(SESSION_COOKIE);

	if (token) {
		const claims = verifySession(token);

		if (claims && !(await isBlocked(claims.username))) {
			// Claims come from the snapshot taken at sign-in, not the cookie: an
			// AD group list is far bigger than a cookie may be.
			const user = userFromClaims(claims, await directoryClaimsFor(claims.username));

			event.locals.user = user;
			event.locals.access = await loadAccess(user);
		} else {
			event.cookies.delete(SESSION_COOKIE, cookieOptions());
		}
	}

	return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
	event.request = request;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
	});
});

export const handle = sequence(originalHandle, handleParaglide);
