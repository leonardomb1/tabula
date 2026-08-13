import { redirect } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';
import {
	OIDC_FLOW_COOKIE,
	callbackUri,
	flowCookieOptions,
	packFlow,
	safeRedirect
} from '$lib/server/auth';
import { authorizeUrl } from '$lib/server/auth/oidc';
import type { PageServerLoad } from './$types';

/** Callback failures come back as `?error=`; everything else starts a new flow. */
function denialMessage(code: string): string {
	switch (code) {
		case 'not_allowed':
		case 'blocked':
			return m.login_error_not_allowed();
		case 'interrupted':
			return m.login_error_interrupted();
		default:
			return m.login_error_unavailable();
	}
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);

	const denial = url.searchParams.get('error');
	if (denial) {
		return { error: denialMessage(denial), notice: null, retryTo: redirectTo };
	}

	// Arriving straight from logout must NOT start a new flow. The IdP session
	// deliberately outlives ours — signing out of Tabula is not signing out of
	// everything — so an automatic redirect here would be answered silently and
	// land the user right back where they started.
	if (url.searchParams.has('signedout')) {
		return { error: null, notice: m.login_signed_out(), retryTo: redirectTo };
	}

	// Only the sign-in button on the post-logout page sets this, so ordinary
	// visits keep the silent SSO hand-off; a deliberate sign-out is followed by
	// a deliberate sign-in.
	const forceLogin = url.searchParams.get('prompt') === 'login';

	let start;
	try {
		start = await authorizeUrl(callbackUri(url), { forceLogin });
	} catch (err) {
		console.error('oidc: could not build the authorize URL', err);
		return { error: m.login_error_unavailable(), notice: null, retryTo: redirectTo };
	}

	cookies.set(
		OIDC_FLOW_COOKIE,
		packFlow({ state: start.state, verifier: start.verifier, redirectTo }),
		flowCookieOptions()
	);
	redirect(303, start.url);
};
