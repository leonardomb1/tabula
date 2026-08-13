/**
 * OpenID Connect authorization code flow with PKCE, spoken directly over fetch.
 *
 * The ID token is read from the token endpoint on the back channel over TLS, so
 * its signature is never re-verified here — OIDC Core 3.1.3.7 permits skipping
 * that exact check when the token does not travel through the browser. That is
 * what keeps a JWKS cache, key rotation and an RS256 verifier out of this file.
 * Move the flow to any front-channel response type and the check stops being
 * optional.
 */

import { createHash, randomBytes } from 'node:crypto';

/** Any JSON a claim can hold — `address` is a standard object-valued one. */
export type ClaimValue = string | number | boolean | null | ClaimValue[] | { [k: string]: ClaimValue };

/** An ID token payload: the claims we name, plus whatever else the IdP mapped. */
export interface OidcClaims {
	sub: string;
	preferred_username?: string;
	name?: string;
	email?: string;
	title?: string;
	groups?: string[];
	[claim: string]: ClaimValue | undefined;
}

interface Discovery {
	authorization_endpoint: string;
	token_endpoint: string;
	end_session_endpoint?: string;
}

const TIMEOUT_MS = Number(process.env.OIDC_TIMEOUT_MS || 10_000);

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

let cached: Promise<Discovery> | null = null;

async function fetchDiscovery(): Promise<Discovery> {
	const base = required('OIDC_ISSUER').replace(/\/?$/, '/');
	const url = new URL('.well-known/openid-configuration', base);

	const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`oidc: discovery failed (${res.status}) at ${url}`);

	const doc: Discovery = await res.json();
	if (!doc.authorization_endpoint || !doc.token_endpoint) {
		throw new Error('oidc: discovery document is missing the authorize or token endpoint');
	}
	return doc;
}

/** Cached for the process lifetime; a failed lookup is never cached. */
export function discover(): Promise<Discovery> {
	if (!cached) {
		cached = fetchDiscovery();
		cached.catch(() => {
			cached = null;
		});
	}
	return cached;
}

export interface AuthStart {
	url: string;
	state: string;
	verifier: string;
}

export async function authorizeUrl(redirectUri: string): Promise<AuthStart> {
	const { authorization_endpoint } = await discover();

	const state = randomBytes(32).toString('base64url');
	const verifier = randomBytes(32).toString('base64url');

	const url = new URL(authorization_endpoint);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', required('OIDC_CLIENT_ID'));
	url.searchParams.set('redirect_uri', redirectUri);
	// `groups` is Authentik's built-in scope for the group claim RBAC binds on.
	url.searchParams.set('scope', process.env.OIDC_SCOPES || 'openid profile email groups');
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
	url.searchParams.set('code_challenge_method', 'S256');

	return { url: url.toString(), state, verifier };
}

/**
 * The decoded claims plus the raw token. The raw form is kept because
 * RP-initiated logout has to hand it back as `id_token_hint` — authentik
 * rejects an end-session request that carries a `post_logout_redirect_uri`
 * without one (OIDC certification reading; `client_id` does not substitute).
 */
export interface ExchangedToken {
	claims: OidcClaims;
	idToken: string;
}

export async function exchange(
	code: string,
	verifier: string,
	redirectUri: string
): Promise<ExchangedToken> {
	const { token_endpoint } = await discover();

	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code,
		redirect_uri: redirectUri,
		client_id: required('OIDC_CLIENT_ID'),
		code_verifier: verifier
	});
	// Public clients authenticate with PKCE alone; confidential ones add the secret.
	const secret = process.env.OIDC_CLIENT_SECRET;
	if (secret) body.set('client_secret', secret);

	const res = await fetch(token_endpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body,
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`oidc: token exchange failed (${res.status}) ${detail.slice(0, 200)}`);
	}

	const token: { id_token?: string } = await res.json();
	if (!token.id_token) throw new Error('oidc: token response carried no id_token');

	return { claims: decodeIdToken(token.id_token), idToken: token.id_token };
}

/** Payload only — see the file header for why the signature is not checked. */
export function decodeIdToken(idToken: string): OidcClaims {
	const parts = idToken.split('.');
	if (parts.length !== 3) throw new Error('oidc: malformed id_token');

	const claims: OidcClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
	if (typeof claims.sub !== 'string' || !claims.sub) {
		throw new Error('oidc: id_token carries no sub');
	}
	return claims;
}

/**
 * RP-initiated logout. `idTokenHint` is the raw ID token from login: authentik
 * (and any OP following the OIDC certification reading) refuses a request that
 * carries a `post_logout_redirect_uri` without it, so the redirect is only
 * asked for when we can prove which session is being ended. Providers accept a
 * hint whose token has already expired — logout arriving after expiry is still
 * legitimate — so a hint stored for the life of the session stays usable.
 *
 * Without a hint we still end the IdP session, just without the round trip
 * back: the OP lands the user on its own logged-out page instead.
 *
 * Null when the provider advertises no end-session endpoint, in which case
 * clearing our own cookie is all logout can mean.
 */
export async function endSessionUrl(
	postLogoutRedirectUri: string,
	idTokenHint?: string
): Promise<string | null> {
	const { end_session_endpoint } = await discover();
	if (!end_session_endpoint) return null;

	const url = new URL(end_session_endpoint);
	url.searchParams.set('client_id', required('OIDC_CLIENT_ID'));
	if (idTokenHint) {
		url.searchParams.set('id_token_hint', idTokenHint);
		url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
	}
	return url.toString();
}
