import { redirect, type RequestHandler } from '@sveltejs/kit';
import {
	OIDC_FLOW_COOKIE,
	authMethods,
	callbackUri,
	flowCookieOptions,
	packFlow,
	safeRedirect
} from '$lib/server/auth';
import { authorizeUrl } from '$lib/server/auth/oidc';

/**
 * Starts the SSO flow: the "Sign in with SSO" button, and where /login sends
 * an OIDC-only deployment straight away. Failures land back on /login with a
 * code the page can explain.
 */
export const GET: RequestHandler = async ({ locals, url, cookies }) => {
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);
	if (!authMethods().oidc) redirect(303, '/login');

	// Only the sign-in button on the post-logout page sets this, so ordinary
	// visits keep the silent SSO hand-off; a deliberate sign-out is followed by
	// a deliberate sign-in.
	const forceLogin = url.searchParams.get('prompt') === 'login';

	let start;
	try {
		start = await authorizeUrl(callbackUri(url), { forceLogin });
	} catch (err) {
		console.error('oidc: could not build the authorize URL', err);
		redirect(303, `/login?error=unavailable&redirectTo=${encodeURIComponent(redirectTo)}`);
	}

	cookies.set(
		OIDC_FLOW_COOKIE,
		packFlow({ state: start.state, verifier: start.verifier, redirectTo }),
		flowCookieOptions()
	);
	redirect(303, start.url);
};
