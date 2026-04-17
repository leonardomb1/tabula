import { redirect, error } from '@sveltejs/kit';
import { startOidcAuth, isOidcConfigured } from '$lib/server/auth';
import type { RequestHandler } from './$types';

const COOKIE_BASE = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: true,
	maxAge: 10 * 60 // 10 minutes — long enough to finish the round trip
};

export const GET: RequestHandler = async ({ url, cookies, request }) => {
	if (!isOidcConfigured()) error(503, 'OIDC não configurado');

	const requestOrigin = new URL(request.url).origin;
	const { url: authUrl, state, codeVerifier, nonce } = await startOidcAuth(requestOrigin);

	cookies.set('oidc_state', state, COOKIE_BASE);
	cookies.set('oidc_verifier', codeVerifier, COOKIE_BASE);
	cookies.set('oidc_nonce', nonce, COOKIE_BASE);

	// Preserve where the user was headed so we can return them there after auth.
	const redirectTo = url.searchParams.get('redirect');
	if (redirectTo) cookies.set('oidc_redirect', redirectTo, COOKIE_BASE);

	redirect(302, authUrl);
};
