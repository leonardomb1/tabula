import { fail, redirect, type Actions } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';
import {
	SESSION_COOKIE,
	authMethods,
	cookieOptions,
	issueToken,
	loginWithPassword,
	safeRedirect,
	type LoginDenial
} from '$lib/server/auth';
import { recordDirectorySnapshot } from '$lib/server/userSettings';
import { throttled } from '$lib/server/throttle';
import { ensureWorkspace } from '$lib/server/workspaces';
import { personalWorkspaceId } from '$lib/server/ids';
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

function rejectionMessage(reason: LoginDenial): string {
	switch (reason) {
		case 'locked':
			return m.login_error_locked();
		case 'disabled':
			return m.login_error_disabled();
		case 'expired':
			return m.login_error_expired();
		case 'blocked':
		case 'not_allowed':
			return m.login_error_not_allowed();
		default:
			return m.login_error_invalid();
	}
}

function ssoHref(redirectTo: string, forceLogin: boolean): string {
	return `/auth/oidc?redirectTo=${encodeURIComponent(redirectTo)}` + (forceLogin ? '&prompt=login' : '');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, redirectTo);

	const methods = authMethods();
	const denial = url.searchParams.get('error');
	// Arriving straight from logout must NOT start a new flow. The IdP session
	// deliberately outlives ours — signing out of Tabula is not signing out of
	// everything — so an automatic redirect here would be answered silently and
	// land the user right back where they started.
	const signedOut = url.searchParams.has('signedout');

	// With SSO as the only door and nothing to say, hand off without a page.
	if (methods.oidc && !methods.ldap && !denial && !signedOut) {
		redirect(303, ssoHref(redirectTo, url.searchParams.get('prompt') === 'login'));
	}

	return {
		error: denial ? denialMessage(denial) : null,
		notice: signedOut ? m.login_signed_out() : null,
		methods,
		// After a sign-out we ask the IdP to re-authenticate: its session
		// outlives ours by design, so without this the button would be answered
		// silently and look like the sign-out never happened.
		ssoHref: methods.oidc ? ssoHref(redirectTo, signedOut) : null
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		if (!authMethods().ldap) return fail(404, { error: m.login_error_unavailable(), identifier: '' });

		const data = await request.formData();
		const identifier = String(data.get('identifier') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!identifier || !password) {
			return fail(400, { error: m.login_error_required(), identifier });
		}
		if (throttled(`login:${identifier.toLowerCase()}:${getClientAddress()}`)) {
			return fail(429, { error: m.login_error_throttled(), identifier });
		}

		let result;
		try {
			result = await loginWithPassword(identifier, password);
		} catch (err) {
			console.error('login: password sign-in failed before a session could be issued', err);
			return fail(503, { error: m.login_error_unavailable(), identifier });
		}

		if (!result.ok) {
			return fail(result.reason === 'invalid' ? 401 : 403, {
				error: rejectionMessage(result.reason),
				identifier
			});
		}

		const { user } = result;
		await recordDirectorySnapshot(user).catch(() => {});
		await ensureWorkspace(
			personalWorkspaceId(user.username),
			user.displayName ?? user.username,
			'personal'
		).catch(() => {});

		cookies.set(SESSION_COOKIE, issueToken(user), cookieOptions());
		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
};
