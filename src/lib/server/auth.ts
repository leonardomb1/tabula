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
	OIDC_GROUPS_CLAIMS,
	PLATFORM_ADMIN_LDAP_GROUPS,
	PLATFORM_ADMIN_OIDC_GROUPS,
	ORIGIN
} = env;

/**
 * Resolve whether a given identity counts as a platform super-user. Called
 * at login time and the result is baked into the session cookie — so the
 * flag only changes on re-login, which is appropriate for a power this
 * elevated. Sources:
 *
 *   1. Nothing if the identity is neither LDAP- nor OIDC-backed.
 *   2. Intersect LDAP memberOf with PLATFORM_ADMIN_LDAP_GROUPS (pipe-sep).
 *   3. Intersect OIDC groups with PLATFORM_ADMIN_OIDC_GROUPS (pipe-sep).
 *
 * The ADMIN_USER break-glass is handled separately at login — it's always
 * a platform admin, no env list consulted.
 */
function splitList(s: string | undefined): string[] {
	return s ? s.split('|').map((x) => x.trim()).filter(Boolean) : [];
}

/**
 * Flatten whatever groups/roles-shaped data an OIDC provider emits into a
 * single `string[]` that the rest of the app matches against. Shape-agnostic:
 *
 *   - Array of strings  → each string is a group (Keycloak, Authentik, Okta, …)
 *   - Object            → each KEY is a group (ZITADEL roles, keyed by role name)
 *   - String scalar     → single-value group (rare, but free to support)
 *   - Anything else     → skipped
 *
 * The claim paths consulted come from `OIDC_GROUPS_CLAIMS` (pipe-separated).
 * Default covers the two most common names so it works out of the box; users
 * whose provider emits something exotic just extend the env.
 *
 * For ZITADEL, set:
 *   OIDC_GROUPS_CLAIMS=groups|roles|urn:zitadel:iam:org:project:roles
 *
 * Duplicates across paths are de-duped.
 */
const DEFAULT_GROUPS_CLAIMS = 'groups|roles';

function extractOidcGroups(c: Record<string, unknown>): string[] {
	const paths = splitList(OIDC_GROUPS_CLAIMS || DEFAULT_GROUPS_CLAIMS);
	const out = new Set<string>();
	for (const path of paths) {
		const v = c[path];
		if (Array.isArray(v)) {
			for (const item of v) if (typeof item === 'string') out.add(item);
		} else if (v && typeof v === 'object') {
			for (const k of Object.keys(v as Record<string, unknown>)) out.add(k);
		} else if (typeof v === 'string') {
			out.add(v);
		}
	}
	return [...out];
}

function computeIsPlatformAdmin(
	ldapGroups: string[] | undefined,
	oidcGroups: string[] | undefined
): boolean {
	const ldapWanted = splitList(PLATFORM_ADMIN_LDAP_GROUPS);
	const oidcWanted = splitList(PLATFORM_ADMIN_OIDC_GROUPS);
	if (ldapWanted.length && ldapGroups?.some((g) => ldapWanted.includes(g))) return true;
	if (oidcWanted.length && oidcGroups?.some((g) => oidcWanted.includes(g))) return true;
	return false;
}

// ── Session (HMAC-signed cookie) ──────────────────────────────────────────

const SESSION_DURATION_MS = parseInt(SESSION_HOURS ?? '8') * 60 * 60 * 1000;
const COOKIE_NAME = 'docs_session';

/**
 * The session cookie carries identity + group membership so `workspaces.ts`
 * can resolve `ldap_group` and `oidc_claim` bindings without re-querying
 * the directory on every request. Groups are refreshed on re-login.
 *
 * Trade-off: cookie grows linearly with the user's group count. Most
 * directories have <50 memberships per user so we stay well under the
 * 4KB cookie cap; cap here if that turns out to be wrong.
 */
export interface SessionInfo {
	username: string;
	displayName: string;
	ldapGroups?: string[];
	oidcGroups?: string[];
	/**
	 * Platform super-user flag. Bypasses every workspace-scoped gate.
	 * Set at login time from the break-glass admin OR configured
	 * PLATFORM_ADMIN_LDAP_GROUPS / PLATFORM_ADMIN_OIDC_GROUPS — never
	 * editable from inside the app, so a compromised platform admin
	 * can't elevate other accounts.
	 */
	isPlatformAdmin?: boolean;
}

interface SessionPayload extends SessionInfo {
	exp: number;
}

function sign(payload: string): string {
	if (!SESSION_SECRET) throw new Error('SESSION_SECRET env var is required');
	return createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

export function createSessionCookie(info: SessionInfo): string {
	const body: SessionPayload = { ...info, exp: Date.now() + SESSION_DURATION_MS };
	const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

export function verifySession(cookie: string | undefined): SessionInfo | null {
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
	return {
		username: data.username,
		displayName: data.displayName ?? data.username,
		ldapGroups: data.ldapGroups,
		oidcGroups: data.oidcGroups,
		isPlatformAdmin: data.isPlatformAdmin
	};
}

export const COOKIE_NAME_EXPORT = COOKIE_NAME;

// ── LDAP (unchanged from previous version) ────────────────────────────────

async function authenticateLDAP(
	username: string,
	password: string
): Promise<{ displayName: string; groups: string[] } | null> {
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
			// `memberOf` comes back as an array of full group DNs in AD/openLDAP.
			// We store DNs verbatim so workspace bindings can match them exactly.
			attributes: ['cn', 'memberOf'],
			sizeLimit: 1
		});

		if (searchEntries.length === 0) return null;
		const entry = searchEntries[0];
		const displayName = (entry.cn as string) || username;
		const memberOf = entry.memberOf;
		const groups: string[] = Array.isArray(memberOf)
			? memberOf.filter((g): g is string => typeof g === 'string')
			: typeof memberOf === 'string'
				? [memberOf]
				: [];
		return { displayName, groups };
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
	/** Values of the `groups` claim (if present), for workspace binding resolution. */
	oidcGroups: string[];
	isPlatformAdmin: boolean;
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

		const oidcGroups = extractOidcGroups(c);

		// Optional group gating — matched against the flattened set so a
		// ZITADEL user with a role of `docs-admins` gates identically to a
		// Keycloak user with a group of `docs-admins`.
		if (OIDC_ALLOWED_GROUPS) {
			const wanted = OIDC_ALLOWED_GROUPS.split('|').map((g) => g.trim()).filter(Boolean);
			const allowed = wanted.some((g) => oidcGroups.includes(g));
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

		return {
			ok: true,
			username,
			displayName,
			oidcGroups,
			isPlatformAdmin: computeIsPlatformAdmin(undefined, oidcGroups)
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'Falha na autenticação OIDC.' };
	}
}

// ── Password login (admin + LDAP only, used by the form on /login) ────────

export async function login(
	username: string,
	password: string
): Promise<
	| {
			ok: true;
			username: string;
			displayName: string;
			ldapGroups?: string[];
			isPlatformAdmin?: boolean;
	  }
	| { ok: false; error: string }
> {
	if (!username || !password) return { ok: false, error: 'Credenciais obrigatórias.' };

	// Admin break-glass first — fastest path, no network. Always a platform
	// admin; nothing else on this path consults the directory.
	if (authenticateAdmin(username, password)) {
		return { ok: true, username, displayName: username, isPlatformAdmin: true };
	}

	// LDAP if configured.
	if (isLdapConfigured()) {
		const result = await authenticateLDAP(username, password);
		if (result !== null) {
			return {
				ok: true,
				username,
				displayName: result.displayName,
				ldapGroups: result.groups,
				isPlatformAdmin: computeIsPlatformAdmin(result.groups, undefined)
			};
		}
	}

	return { ok: false, error: 'Usuário ou senha inválidos.' };
}
