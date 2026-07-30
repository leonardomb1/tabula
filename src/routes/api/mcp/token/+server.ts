import { json, type RequestHandler } from '@sveltejs/kit';
import { login } from '$lib/server/auth';
import { mintToken } from '$lib/server/tokens';
import { recordDirectorySnapshot } from '$lib/server/userSettings';

/**
 * Exchanges directory credentials for a short-lived MCP bearer token.
 *
 * Lets a calling service (an AI app authenticating its own users against the same
 * k-auth directory) obtain a tabula token at the moment it already holds the
 * password, instead of asking every user to mint one by hand. k-auth stays the only
 * authority on identity: no shared signing secret, and no way to act as a user
 * whose credentials were not presented.
 *
 * The token carries a snapshot of that user's claims, so permissions are the same
 * ones the browser session would get, frozen until the next exchange — keep the
 * lifetime short.
 */

const DEFAULT_MINUTES = 60;
const MAX_MINUTES = 720;

function lifetimeMinutes(requested: unknown): number {
	const configured = Number(process.env.MCP_TOKEN_MINUTES);
	const fallback = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MINUTES;
	const asked = Number(requested);
	const minutes = Number.isFinite(asked) && asked > 0 ? asked : fallback;
	return Math.min(minutes, MAX_MINUTES);
}

/**
 * Per-identifier throttle. In-memory, so it is per-instance and not a real
 * defence on its own — the directory's own lockout is what bounds a sustained
 * attack. This only blunts a burst against a single instance.
 */
const ATTEMPTS = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function throttled(identifier: string): boolean {
	const now = Date.now();
	const seen = ATTEMPTS.get(identifier);
	if (!seen || seen.resetAt < now) {
		ATTEMPTS.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
		return false;
	}
	seen.count++;
	return seen.count > MAX_ATTEMPTS;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		identifier?: string;
		password?: string;
		label?: string;
		minutes?: number;
	};

	const identifier = (body.identifier ?? '').trim();
	const password = body.password ?? '';
	if (!identifier || !password) {
		return json({ error: 'identifier and password are required' }, { status: 400 });
	}

	if (throttled(identifier.toLowerCase())) {
		return json({ error: 'too many attempts' }, { status: 429, headers: { 'retry-after': '60' } });
	}

	let result;
	try {
		result = await login(identifier, password);
	} catch {
		return json({ error: 'auth service unavailable' }, { status: 503 });
	}

	if (!result.ok) {
		// Same status mapping as /auth/login, so a client can react identically.
		const status = result.reason === 'locked' ? 423 : result.reason === 'disabled' ? 403 : 401;
		return json({ error: result.reason, code: result.code }, { status });
	}

	const { user } = result;
	await recordDirectorySnapshot(user).catch(() => {});

	const minutes = lifetimeMinutes(body.minutes);
	const label = (body.label ?? '').trim().slice(0, 64) || 'mcp-exchange';
	const expiresAt = new Date(Date.now() + minutes * 60_000);
	const minted = await mintToken(user, label, expiresAt);

	return json(
		{
			token: minted.token,
			tokenType: 'Bearer',
			expiresAt: expiresAt.toISOString(),
			expiresIn: minutes * 60,
			endpoint: '/api/mcp',
			user: { username: user.username, displayName: user.displayName ?? user.username }
		},
		{ status: 201 }
	);
};
