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
	if (denial) return { error: denialMessage(denial), retryTo: redirectTo };

	let start;
	try {
		start = await authorizeUrl(callbackUri(url));
	} catch (err) {
		console.error('oidc: could not build the authorize URL', err);
		return { error: m.login_error_unavailable(), retryTo: redirectTo };
	}

	cookies.set(
		OIDC_FLOW_COOKIE,
		packFlow({ state: start.state, verifier: start.verifier, redirectTo }),
		flowCookieOptions()
	);
	redirect(303, start.url);
};
