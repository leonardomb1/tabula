import { ATTR, type Principal } from '../access';
import { gateVerdict } from '../gate';
import { kauthAuthenticate, type KauthRejection, type KauthUser } from './kauth';
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

export { verifySession };
export type { SessionClaims } from './session';

function sessionTtlSeconds(): number {
	const hours = Number(process.env.SESSION_HOURS ?? '8');
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

// memberOf may carry bare names or full DNs; expose both so either form matches.
function groupNames(memberOf: string[]): string[] {
	const names = memberOf.map((g) => /^cn=([^,]+)/i.exec(g)?.[1] ?? g);
	return [...new Set([...memberOf, ...names])];
}

function buildClaims(u: KauthUser): Record<string, string[]> {
	const claims: Record<string, string[]> = {
		[ATTR.USER]: [u.sAMAccountName],
		[ATTR.AD_GROUP]: groupNames(u.memberOf ?? [])
	};
	const costCenter = u.additionalInfo?.costCenterCode;
	if (typeof costCenter === 'string' && costCenter) {
		claims[ATTR.COST_CENTER] = [costCenter];
	}
	return claims;
}

export type LoginDenial = KauthRejection | 'blocked' | 'not_allowed';

export type LoginResult =
	| { ok: true; user: SessionUser }
	| { ok: false; reason: LoginDenial; code: string };

export async function login(identifier: string, password: string): Promise<LoginResult> {
	const result = await kauthAuthenticate(identifier, password);
	if (!result.ok) return result;
	const u = result.user;

	const admin = new Set(adminGroups().map((g) => g.toLowerCase()));
	const extra = u.additionalInfo ?? {};
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

	const user: SessionUser = {
		username: u.sAMAccountName,
		claims: buildClaims(u),
		isPlatformAdmin:
			adminUsers().some((n) => n.toLowerCase() === u.sAMAccountName.toLowerCase()) ||
			groupNames(u.memberOf ?? []).some((g) => admin.has(g.toLowerCase())),
		displayName: u.displayName,
		mail: u.mail,
		title: u.title,
		employeeId: u.employeeID,
		costCenterCode: str(extra.costCenterCode),
		costCenterDescription: str(extra.costCenterDescription)
	};

	const verdict = await gateVerdict(user);
	if (verdict !== 'ok') return { ok: false, reason: verdict, code: verdict };

	return { ok: true, user };
}

export function issueToken(user: SessionUser): string {
	const claims: SessionClaims = {
		username: user.username,
		claims: user.claims,
		isPlatformAdmin: user.isPlatformAdmin,
		displayName: user.displayName,
		mail: user.mail,
		title: user.title,
		employeeId: user.employeeId,
		costCenterCode: user.costCenterCode,
		costCenterDescription: user.costCenterDescription,
		exp: Math.floor(Date.now() / 1000) + sessionTtlSeconds()
	};
	return signSession(claims);
}

export function userFromClaims(c: SessionClaims): SessionUser {
	return {
		username: c.username,
		claims: c.claims,
		isPlatformAdmin: c.isPlatformAdmin,
		displayName: c.displayName,
		mail: c.mail,
		title: c.title,
		employeeId: c.employeeId,
		costCenterCode: c.costCenterCode,
		costCenterDescription: c.costCenterDescription
	};
}

export function cookieOptions() {
	const secure = process.env.COOKIE_SECURE
		? process.env.COOKIE_SECURE === 'true'
		: (process.env.ORIGIN?.startsWith('https://') ?? false);
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		maxAge: sessionTtlSeconds()
	};
}
