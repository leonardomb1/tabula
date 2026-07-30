import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, gt, or } from 'drizzle-orm';
import { db } from './db';
import { apiTokens, type ApiToken } from './db/schema';
import { newDocId } from './ids';
import type { Principal } from './access';
import type { SessionUser } from './auth';

const PREFIX = 'tbl_';

function hash(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export interface MintedToken {
	id: string;
	token: string;
	label: string;
}

export async function mintToken(
	user: SessionUser,
	label: string,
	expiresAt?: Date
): Promise<MintedToken> {
	const token = PREFIX + randomBytes(32).toString('base64url');
	const id = newDocId();
	await db.insert(apiTokens).values({
		id,
		tokenHash: hash(token),
		username: user.username,
		claims: user.claims,
		isPlatformAdmin: user.isPlatformAdmin,
		label,
		expiresAt: expiresAt ?? null
	});
	return { id, token, label };
}

export async function principalFromToken(token: string): Promise<Principal | null> {
	if (!token.startsWith(PREFIX)) return null;
	const [row] = await db
		.select()
		.from(apiTokens)
		.where(
			and(
				eq(apiTokens.tokenHash, hash(token)),
				isNull(apiTokens.revokedAt),
				or(isNull(apiTokens.expiresAt), gt(apiTokens.expiresAt, new Date()))
			)
		)
		.limit(1);
	if (!row) return null;

	await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));

	return {
		username: row.username,
		claims: row.claims as Record<string, string[]>,
		isPlatformAdmin: row.isPlatformAdmin
	};
}

export async function listTokens(username: string): Promise<Omit<ApiToken, 'tokenHash'>[]> {
	const rows = await db
		.select()
		.from(apiTokens)
		.where(eq(apiTokens.username, username))
		.orderBy(desc(apiTokens.createdAt));
	return rows.map(({ tokenHash: _omit, ...rest }) => rest);
}

export async function revokeToken(username: string, id: string): Promise<boolean> {
	const rows = await db
		.update(apiTokens)
		.set({ revokedAt: new Date() })
		.where(and(eq(apiTokens.id, id), eq(apiTokens.username, username), isNull(apiTokens.revokedAt)))
		.returning({ id: apiTokens.id });
	return rows.length > 0;
}
