/**
 * Short-lived signed links to a rendered artifact.
 *
 * The signature IS the capability: whoever holds the link can fetch the bytes
 * without a session, which is what lets a calling service download a PDF it was
 * handed over MCP. Access is therefore checked when the link is minted, never when
 * it is redeemed, so the TTL is deliberately short.
 *
 * Signed with a key derived from SESSION_SECRET under its own label, so an artifact
 * token can never be confused for a session token.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const LABEL = 'tabula-artifact-v1';

export const DEFAULT_TTL_MINUTES = 10;

interface Payload {
	/** Storage key of the bytes. */
	k: string;
	/** Expiry, unix seconds. */
	e: number;
	/** Suggested download filename. */
	n?: string;
}

function key(): string {
	const secret = process.env.SESSION_SECRET;
	if (!secret) throw new Error('SESSION_SECRET is not set');
	return createHmac('sha256', secret).update(LABEL).digest('hex');
}

function sign(payload: string): string {
	return createHmac('sha256', key()).update(payload).digest('base64url');
}

export function ttlMinutes(): number {
	const raw = Number(process.env.ARTIFACT_TTL_MINUTES);
	return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 1440) : DEFAULT_TTL_MINUTES;
}

/** Mint a token for a storage key. Callers must have authorized access first. */
export function signArtifact(
	storageKey: string,
	filename?: string,
	minutes = ttlMinutes()
): { token: string; expiresAt: Date } {
	const expiresAt = new Date(Date.now() + minutes * 60_000);
	const payload: Payload = { k: storageKey, e: Math.floor(expiresAt.getTime() / 1000) };
	if (filename) payload.n = filename;
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return { token: `${encoded}.${sign(encoded)}`, expiresAt };
}

/** Null for a tampered, malformed or expired token — callers should answer 404. */
export function verifyArtifact(token: string): { storageKey: string; filename?: string } | null {
	const dot = token.lastIndexOf('.');
	if (dot <= 0) return null;

	const encoded = token.slice(0, dot);
	const provided = Buffer.from(token.slice(dot + 1), 'base64url');
	const expected = Buffer.from(sign(encoded), 'base64url');
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

	try {
		const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Payload;
		if (typeof payload.k !== 'string' || typeof payload.e !== 'number') return null;
		if (payload.e * 1000 < Date.now()) return null;
		return { storageKey: payload.k, filename: typeof payload.n === 'string' ? payload.n : undefined };
	} catch {
		return null;
	}
}
