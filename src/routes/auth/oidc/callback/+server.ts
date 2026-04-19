import { redirect, error } from '@sveltejs/kit';
import { finishOidcAuth, createSessionCookie, isOidcConfigured } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!isOidcConfigured()) error(503, 'OIDC não configurado');

	const state = cookies.get('oidc_state');
	const codeVerifier = cookies.get('oidc_verifier');
	const nonce = cookies.get('oidc_nonce');
	const redirectTo = cookies.get('oidc_redirect') ?? '/';

	// One-shot cookies — delete regardless of outcome.
	cookies.delete('oidc_state', { path: '/' });
	cookies.delete('oidc_verifier', { path: '/' });
	cookies.delete('oidc_nonce', { path: '/' });
	cookies.delete('oidc_redirect', { path: '/' });

	if (!state || !codeVerifier || !nonce) {
		error(400, 'Sessão OIDC expirada. Tente entrar novamente.');
	}

	const result = await finishOidcAuth(url, { state, codeVerifier, nonce });
	if (!result.ok) error(401, result.error);

	cookies.set('docs_session', createSessionCookie({
		username: result.username,
		displayName: result.displayName,
		oidcGroups: result.oidcGroups,
		isPlatformAdmin: result.isPlatformAdmin
	}), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 8
	});

	redirect(302, redirectTo);
};
