import { redirect, type RequestHandler } from '@sveltejs/kit';
import {
	ID_TOKEN_COOKIE,
	OIDC_FLOW_COOKIE,
	SESSION_COOKIE,
	callbackUri,
	cookieOptions,
	flowCookieOptions,
	issueToken,
	safeRedirect,
	sessionFor,
	unpackFlow
} from '$lib/server/auth';
import { exchange } from '$lib/server/auth/oidc';
import { recordDirectorySnapshot } from '$lib/server/userSettings';
import { ensureWorkspace } from '$lib/server/workspaces';
import { personalWorkspaceId } from '$lib/server/ids';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const flow = unpackFlow(cookies.get(OIDC_FLOW_COOKIE));
	// One shot per flow: the code is spent either way, so the cookie goes now.
	cookies.delete(OIDC_FLOW_COOKIE, flowCookieOptions());

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (url.searchParams.get('error')) {
		console.error('oidc: provider refused the authorization', {
			error: url.searchParams.get('error'),
			description: url.searchParams.get('error_description')
		});
		redirect(303, '/login?error=interrupted');
	}

	// A missing cookie means the flow expired or never started here; a state
	// mismatch means this callback belongs to some other flow. Both restart.
	if (!flow || !code || !state || state !== flow.state) {
		redirect(303, '/login?error=interrupted');
	}

	const exchanged = await exchange(code, flow.verifier, callbackUri(url)).catch((err) => {
		console.error('oidc: code exchange failed', err);
		return null;
	});
	if (!exchanged) redirect(303, '/login?error=unavailable');

	const { claims, idToken } = exchanged;

	const result = await sessionFor(claims).catch((err) => {
		console.error('oidc: could not build a session from the id_token', err);
		return null;
	});
	if (!result) redirect(303, '/login?error=unavailable');
	if (!result.ok) redirect(303, `/login?error=${result.reason}`);

	const { user } = result;
	// The session cookie carries no claims; every request reads them from this
	// snapshot, so a sign-in that could not record it must not proceed.
	const recorded = await recordDirectorySnapshot(user).then(
		() => true,
		(err) => {
			console.error('oidc: could not record the directory snapshot', err);
			return false;
		}
	);
	if (!recorded) redirect(303, '/login?error=unavailable');
	await ensureWorkspace(
		personalWorkspaceId(user.username),
		user.displayName ?? user.username,
		'personal'
	).catch(() => {});

	cookies.set(SESSION_COOKIE, issueToken(user), cookieOptions());
	// Kept for logout's `id_token_hint`; see ID_TOKEN_COOKIE.
	cookies.set(ID_TOKEN_COOKIE, idToken, cookieOptions());
	redirect(303, safeRedirect(flow.redirectTo));
};
