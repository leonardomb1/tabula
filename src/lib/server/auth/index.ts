import { ATTR, PREFIX_SUFFIX, type Principal } from '../access';
import { gateVerdict } from '../gate';
import { ldapAuthenticate, ldapConfigured, type LdapRejection } from './ldap';
import type { OidcClaims } from './oidc';
import { signSession, verifySession, type SessionClaims } from './session';

export interface SessionUser extends Principal {
	displayName?: string;
	mail?: string;
	title?: string;
	employeeId?: string;
	costCenterCode?: string;
	costCenterDescription?: string;
}

export const SESSION_COOKIE = 'tabula_session';

/** Holds the in-flight PKCE exchange between the redirect out and the callback. */
export const OIDC_FLOW_COOKIE = 'tabula_oidc';

/**
 * The raw ID token from login, kept only so logout can pass it back as
 * `id_token_hint`. Separate from the session cookie so the ~1 KB token does not
 * ride along on every request, and so session encoding stays untouched. Shares
 * the session's attributes and lifetime.
 */
export const ID_TOKEN_COOKIE = 'tabula_idt';

export { verifySession };
export type { SessionClaims } from './session';

function sessionTtlSeconds(): number {
	const hours = Number(process.env.SESSION_HOURS || '8');
	return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 3600;
}

function envList(value: string | undefined): string[] {
	return (value ?? '')
		.split(/[|,]/)
		.map((g) => g.trim())
		.filter(Boolean);
}

function adminGroups(): string[] {
	return envList(process.env.PLATFORM_ADMIN_GROUPS);
}

function adminUsers(): string[] {
	return envList(process.env.PLATFORM_ADMIN_USERS);
}

// Group claims may carry bare names or full DNs — a directory federated from AD
// can emit either. Expose both forms so a binding written against either matches.
function groupNames(groups: string[]): string[] {
	const names = groups.map((g) => /^cn=([^,]+)/i.exec(g)?.[1] ?? g);
	return [...new Set([...groups, ...names])];
}

function claimText(c: OidcClaims, name: string): string | undefined {
	const value = c[name];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asList(value: OidcClaims[string]): string[] {
	if (Array.isArray(value)) {
		return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
	}
	if (typeof value === 'string') return value ? [value] : [];
	if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
	// Nested objects have no sensible string form to match a binding against.
	return [];
}

function claimList(c: OidcClaims, name: string): string[] {
	return asList(c[name]);
}

/**
 * Claims the token carries for the protocol rather than for us. Binding on them
 * would be meaningless (`exp` differs every login) or a trap (`sub` is opaque,
 * so a `sub` binding looks like a user binding and behaves nothing like one).
 */
const PROTOCOL_CLAIMS = new Set([
	'acr',
	'amr',
	'at_hash',
	'aud',
	'auth_time',
	'azp',
	'c_hash',
	'exp',
	'iat',
	'iss',
	'jti',
	'nbf',
	'nonce',
	's_hash',
	'session_state',
	'sid',
	'sub',
	'typ'
]);

/**
 * Every claim the IdP sent becomes bindable, keyed by its own name. This is why
 * mapping a new attribute in Authentik needs no change here.
 */
function buildClaims(c: OidcClaims, username: string): Record<string, string[]> {
	const claims: Record<string, string[]> = { [ATTR.USER]: [username] };

	for (const [name, value] of Object.entries(c)) {
		if (PROTOCOL_CLAIMS.has(name) || name.endsWith(PREFIX_SUFFIX)) continue;

		const values = name === ATTR.GROUPS ? groupNames(asList(value)) : asList(value);
		if (values.length) claims[name] = values;
	}

	return claims;
}

export type LoginDenial = 'blocked' | 'not_allowed' | LdapRejection;

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; reason: LoginDenial };

/** Which doors are open. Both come from env, so a deployment picks either or both. */
export function authMethods(): { ldap: boolean; oidc: boolean } {
	return { ldap: ldapConfigured(), oidc: !!process.env.OIDC_ISSUER };
}

/**
 * Map ID token claims into the principal the rest of the app speaks. Pure: the
 * IdP already authenticated the person, this only translates vocabulary.
 * `usernameClaim` defaults to the OIDC setting; the LDAP path always names its
 * username `preferred_username`, whatever the IdP was told to call it.
 */
export function principalFromClaims(
	c: OidcClaims,
	usernameClaim = process.env.OIDC_USERNAME_CLAIM || 'preferred_username'
): SessionUser {
	const username = claimText(c, usernameClaim);

	// Falling back to `sub` would mint an opaque UUID identity: a fresh personal
	// workspace, no binding matches, no block match. Failing loudly is safer.
	if (!username) {
		throw new Error(`oidc: id_token carries no "${usernameClaim}" claim to use as the username`);
	}

	const groups = groupNames(claimList(c, ATTR.GROUPS));
	const admin = new Set(adminGroups().map((g) => g.toLowerCase()));

	return {
		username,
		claims: buildClaims(c, username),
		isPlatformAdmin:
			adminUsers().some((n) => n.toLowerCase() === username.toLowerCase()) ||
			groups.some((g) => admin.has(g.toLowerCase())),
		displayName: claimText(c, 'name'),
		mail: claimText(c, 'email'),
		title: claimText(c, 'title'),
		employeeId: claimText(c, 'employee_id'),
		costCenterCode: claimText(c, 'cost_center'),
		costCenterDescription: claimText(c, 'cost_center_description')
	};
}

/** The mapping above, then the local admit/deny. */
export async function sessionFor(c: OidcClaims, usernameClaim?: string): Promise<LoginResult> {
	const user = principalFromClaims(c, usernameClaim);

	const verdict = await gateVerdict(user);
	if (verdict !== 'ok') return { ok: false, reason: verdict };

	return { ok: true, user };
}

/**
 * Password sign-in: the directory verifies the credential, then the same
 * mapping and gate the OIDC callback runs. Directory failures throw.
 */
export async function loginWithPassword(identifier: string, password: string): Promise<LoginResult> {
	const result = await ldapAuthenticate(identifier, password);
	if (!result.ok) return { ok: false, reason: result.reason };
	return sessionFor(result.claims, 'preferred_username');
}

export function issueToken(user: SessionUser): string {
	const claims: SessionClaims = {
		username: user.username,
		isPlatformAdmin: user.isPlatformAdmin,
		displayName: user.displayName,
		mail: user.mail,
		title: user.title,
		employeeId: user.employeeId,
		costCenterCode: user.costCenterCode,
		costCenterDescription: user.costCenterDescription,
		exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds()
	};

	const token = signSession(claims);

	// Identity fields only, so this should never trip; if it does, an oversized
	// cookie is dropped silently and reads as an endless bounce back to /login —
	// fail where we can say why.
	if (token.length > 3800) {
		throw new Error(
			`auth: the session cookie would be ${token.length} bytes, past what browsers keep.`
		);
	}

	return token;
}

/**
 * The principal for a request: identity from the cookie, claims from the
 * directory snapshot taken at sign-in. A cookie issued before claims moved
 * out of it still carries them, which covers the moment a snapshot is missing.
 */
export function userFromClaims(
	c: SessionClaims,
	claims: Record<string, string[]> | null | undefined = c.claims
): SessionUser {
	return {
		username: c.username,
		claims: claims ?? c.claims ?? { [ATTR.USER]: [c.username] },
		isPlatformAdmin: c.isPlatformAdmin,
		displayName: c.displayName,
		mail: c.mail,
		title: c.title,
		employeeId: c.employeeId,
		costCenterCode: c.costCenterCode,
		costCenterDescription: c.costCenterDescription
	};
}

function secureCookies(): boolean {
	return process.env.COOKIE_SECURE
		? process.env.COOKIE_SECURE === 'true'
		: (process.env.ORIGIN?.startsWith('https://') ?? false);
}

export function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: secureCookies(),
		maxAge: sessionTtlSeconds()
	};
}

/**
 * `lax`, not `strict`: the callback arrives as a top-level GET navigation from
 * the IdP, and a strict cookie would not be sent with it.
 */
export function flowCookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: secureCookies(),
		maxAge: 600
	};
}

export interface OidcFlow {
	state: string;
	verifier: string;
	redirectTo: string;
}

export function packFlow(flow: OidcFlow): string {
	return Buffer.from(JSON.stringify(flow)).toString('base64url');
}

/**
 * Unsigned on purpose: the cookie is httpOnly and its only job is to be compared
 * against the state the IdP echoes back, so forging it gains nothing an attacker
 * could not get by starting their own flow.
 */
export function unpackFlow(value: string | undefined): OidcFlow | null {
	if (!value) return null;
	try {
		const flow: OidcFlow = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
		if (typeof flow.state !== 'string' || typeof flow.verifier !== 'string') return null;
		return flow;
	} catch {
		return null;
	}
}

export function callbackUri(url: URL): string {
	return new URL('/auth/callback', url.origin).toString();
}

/** Only same-origin absolute paths survive, so a redirect cannot leave the app. */
export function safeRedirect(target: string | null | undefined): string {
	return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
}
