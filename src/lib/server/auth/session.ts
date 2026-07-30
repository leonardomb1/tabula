import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionClaims {
	username: string;
	claims: Record<string, string[]>;
	isPlatformAdmin: boolean;
	displayName?: string;
	mail?: string;
	title?: string;
	employeeId?: string;
	costCenterCode?: string;
	costCenterDescription?: string;
	exp: number;
}

function secret(): string {
	const s = process.env.SESSION_SECRET;
	if (!s) throw new Error('SESSION_SECRET is not set');
	return s;
}

function sign(payload: string): string {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signSession(claims: SessionClaims): string {
	const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string): SessionClaims | null {
	const dot = token.indexOf('.');
	if (dot < 0) return null;

	const payload = token.slice(0, dot);
	const mac = Buffer.from(token.slice(dot + 1));
	const expected = Buffer.from(sign(payload));
	if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;

	try {
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
		if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
		return claims;
	} catch {
		return null;
	}
}
