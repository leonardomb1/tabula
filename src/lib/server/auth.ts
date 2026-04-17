import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import * as oidc from 'openid-client';

const {
	LDAP_URL,
	LDAP_BASE_DN,
	LDAP_DOMAIN,
	LDAP_REQUIRED_GROUP,
	LDAP_REQUIRED_OU,
	LDAP_VERIFY_CERT,
	ADMIN_USER,
	ADMIN_PASSWORD,
	SESSION_SECRET,
	SESSION_HOURS,
	OIDC_ISSUER,
	OIDC_CLIENT_ID,
	OIDC_CLIENT_SECRET,
	OIDC_SCOPES,
	OIDC_ALLOWED_GROUPS,
	ORIGIN
} = env;

// ── Session (HMAC-signed cookie) ──────────────────────────────────────────

const SESSION_DURATION_MS = parseInt(SESSION_HOURS ?? '8') * 60 * 60 * 1000;
const COOKIE_NAME = 'docs_session';

interface SessionPayload {
	username: string;
	displayName: string;
	exp: number;
}

function sign(payload: string): string {
	if (!SESSION_SECRET) throw new Error('SESSION_SECRET env var is required');
	return createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

export function createSessionCookie(username: string, displayName: string): string {
	const payload = Buffer.from(
		JSON.stringify({ username, displayName, exp: Date.now() + SESSION_DURATION_MS })
	).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

export function verifySession(cookie: string | undefined): { username: string; displayName: string } | null {
	if (!cookie) return null;
	const dot = cookie.lastIndexOf('.');
	if (dot === -1) return null;

	const payload = cookie.slice(0, dot);
	const sig = cookie.slice(dot + 1);

	try {
		const expected = sign(payload);
		if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
	} catch {
		return null;
	}

	let data: SessionPayload;
	try {
		data = JSON.parse(Buffer.from(payload, 'base64url').toString());
	} catch {
		return null;
	}

	if (Date.now() > data.exp) return null;
	return { username: data.username, displayName: data.displayName ?? data.username };
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;

// ── LDAP (unchanged from previous version) ────────────────────────────────

async function authenticateLDAP(username: string, password: string): Promise<string | null> {
	if (!LDAP_URL || !LDAP_BASE_DN || !LDAP_DOMAIN) return null;

	const { Client } = await import('ldapts');
	const verifyCert = LDAP_VERIFY_CERT !== 'false';
	const client = new Client({
		url: LDAP_URL,
		connectTimeout: 5000,
		tlsOptions: { rejectUnauthorized: verifyCert }
	});

	try {
		await client.bind(`${username}@${LDAP_DOMAIN}`, password);

		let filter = `(userPrincipalName=${username}@${LDAP_DOMAIN})`;
		if (LDAP_REQUIRED_GROUP) {
			const groups = LDAP_REQUIRED_GROUP.split('|').map((g) => g.trim()).filter(Boolean);
			const groupFilter =
				groups.length === 1
					? `(memberOf=${groups[0]})`
					: `(|${groups.map((g) => `(memberOf=${g})`).join('')})`;
			filter = `(&${filter}${groupFilter})`;
		}

		const searchBase = LDAP_REQUIRED_OU || LDAP_BASE_DN;
		const { searchEntries } = await client.search(searchBase, {
			scope: 'sub',
			filter,
			attributes: ['cn'],
			sizeLimit: 1
		});

		if (searchEntries.length === 0) return null;
		return (searchEntries[0].cn as string) || username;
	} catch {
		return null;
	} finally {
		try { await client.unbind(); } catch { /* ignore */ }
	}
}

export function isLdapConfigured(): boolean {
	return !!(LDAP_URL && LDAP_BASE_DN && LDAP_DOMAIN);
}

// ── Admin break-glass (always on when configured) ─────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a), Buffer.from(b));
	} catch {
		return false;
	}
}

function authenticateAdmin(username: string, password: string): boolean {
	if (!ADMIN_USER || !ADMIN_PASSWORD) return false;
	return constantTimeEqual(username, ADMIN_USER) && constantTimeEqual(password, ADMIN_PASSWORD);
}

// ── OIDC (authorization code + PKCE) ──────────────────────────────────────
//
// Discovery + client config is cached per process. Set OIDC_ISSUER,
// OIDC_CLIENT_ID, OIDC_CLIENT_SECRET to enable. Optional OIDC_SCOPES
// (default: "openid profile email") and OIDC_ALLOWED_GROUPS (pipe-separated
// group names — user's `groups` claim must intersect).

export function isOidcConfigured(): boolean {
	// Client secret is optional — public clients use PKCE only. Issuer + client
	// ID are the minimum.
	return !!(OIDC_ISSUER && OIDC_CLIENT_ID);
}

let _oidcConfig: oidc.Configuration | null = null;
let _oidcConfigPromise: Promise<oidc.Configuration> | null = null;

async function getOidcConfig(): Promise<oidc.Configuration> {
	if (_oidcConfig) return _oidcConfig;
	if (!_oidcConfigPromise) {
		if (!isOidcConfigured()) throw new Error('OIDC not configured');

		// With a secret → confidential client (client_secret_post / basic).
		// Without a secret → public client, PKCE-only (token_endpoint_auth_method: none).
		const clientMetadata = OIDC_CLIENT_SECRET
			? OIDC_CLIENT_SECRET
			: { token_endpoint_auth_method: 'none' };

		_oidcConfigPromise = oidc
			.discovery(new URL(OIDC_ISSUER!), OIDC_CLIENT_ID!, clientMetadata)
			.then((c) => {
				_oidcConfig = c;
				return c;
			});
	}
	return _oidcConfigPromise;
}

export const OIDC_SCOPE = (OIDC_SCOPES ?? 'openid profile email').trim();

export function oidcRedirectUri(requestOrigin?: string): string {
	const base = ORIGIN || requestOrigin || '';
	return `${base.replace(/\/$/, '')}/auth/oidc/callback`;
}

export interface OidcAuthInit {
	url: string;
	state: string;
	codeVerifier: string;
	nonce: string;
}

export async function startOidcAuth(requestOrigin?: string): Promise<OidcAuthInit> {
	const config = await getOidcConfig();
	const state = oidc.randomState();
	const nonce = oidc.randomNonce();
	const codeVerifier = oidc.randomPKCECodeVerifier();
	const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

	const params: Record<string, string> = {
		redirect_uri: oidcRedirectUri(requestOrigin),
		scope: OIDC_SCOPE,
		state,
		nonce,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		// Force the account picker every time — prevents silently reusing an
		// unrelated provider session (e.g. a ZITADEL admin browser login).
		prompt: 'select_account'
	};

	const url = oidc.buildAuthorizationUrl(config, params).href;
	return { url, state, codeVerifier, nonce };
}

export interface OidcResult {
	ok: true;
	username: string;
	displayName: string;
}

export async function finishOidcAuth(
	callbackUrl: URL,
	expected: { state: string; codeVerifier: string; nonce: string }
): Promise<OidcResult | { ok: false; error: string }> {
	try {
		const config = await getOidcConfig();
		const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
			pkceCodeVerifier: expected.codeVerifier,
			expectedState: expected.state,
			expectedNonce: expected.nonce
		});

		const idClaims = tokens.claims();
		if (!idClaims) return { ok: false, error: 'ID token sem claims.' };

		// Merge id_token claims with userinfo — some providers (e.g. ZITADEL)
		// only put preferred_username / email / name in userinfo, not id_token.
		// id_token claims take precedence in case of conflict.
		let c: Record<string, unknown> = { ...idClaims };
		try {
			const sub = String(idClaims.sub);
			const userInfo = await oidc.fetchUserInfo(config, tokens.access_token, sub);
			c = { ...userInfo, ...idClaims };
		} catch {
			// userinfo is optional per spec; fall back to id_token claims only.
		}

		// Optional group gating
		if (OIDC_ALLOWED_GROUPS) {
			const wanted = OIDC_ALLOWED_GROUPS.split('|').map((g) => g.trim()).filter(Boolean);
			const userGroups = Array.isArray(c.groups)
				? (c.groups as unknown[]).filter((g): g is string => typeof g === 'string')
				: [];
			const allowed = wanted.some((g) => userGroups.includes(g));
			if (!allowed) return { ok: false, error: 'Usuário sem grupo autorizado.' };
		}

		const username =
			(typeof c.preferred_username === 'string' && c.preferred_username) ||
			(typeof c.email === 'string' && c.email) ||
			String(c.sub);
		const displayName =
			(typeof c.name === 'string' && c.name) ||
			(typeof c.preferred_username === 'string' && c.preferred_username) ||
			username;

		return { ok: true, username, displayName };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Falha na autenticação OIDC.' };
	}
}

// ── Password login (admin + LDAP only, used by the form on /login) ────────

export async function login(
	username: string,
	password: string
): Promise<{ ok: true; username: string; displayName: string } | { ok: false; error: string }> {
	if (!username || !password) return { ok: false, error: 'Credenciais obrigatórias.' };

	// Admin break-glass first — fastest path, no network.
	if (authenticateAdmin(username, password)) {
		return { ok: true, username, displayName: username };
	}

	// LDAP if configured.
	if (isLdapConfigured()) {
		const ldapName = await authenticateLDAP(username, password);
		if (ldapName !== null) return { ok: true, username, displayName: ldapName };
	}

	return { ok: false, error: 'Usuário ou senha inválidos.' };
}
