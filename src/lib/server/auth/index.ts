import { ATTR, type Principal } from '../access';
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

function adminGroups(): string[] {
	return (process.env.PLATFORM_ADMIN_GROUPS ?? 'GG_BRA_TI_DOCS_ADMINS')
		.split(/[|,]/)
		.map((g) => g.trim())
		.filter(Boolean);
}

function buildClaims(u: KauthUser): Record<string, string[]> {
	const claims: Record<string, string[]> = {
		[ATTR.USER]: [u.sAMAccountName],
		[ATTR.AD_GROUP]: u.memberOf ?? []
	};
	const costCenter = u.additionalInfo?.costCenterCode;
	if (typeof costCenter === 'string' && costCenter) {
		claims[ATTR.COST_CENTER] = [costCenter];
	}
	return claims;
}

export type LoginResult =
	| { ok: true; user: SessionUser }
	| { ok: false; reason: KauthRejection; code: string };

export async function login(identifier: string, password: string): Promise<LoginResult> {
	const result = await kauthAuthenticate(identifier, password);
	if (!result.ok) return result;
	const u = result.user;

	const admin = adminGroups();
	const extra = u.additionalInfo ?? {};
	const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

	const user: SessionUser = {
		username: u.sAMAccountName,
		claims: buildClaims(u),
		isPlatformAdmin: u.memberOf.some((g) => admin.includes(g)),
		displayName: u.displayName,
		mail: u.mail,
		title: u.title,
		employeeId: u.employeeID,
		costCenterCode: str(extra.costCenterCode),
		costCenterDescription: str(extra.costCenterDescription)
	};

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
