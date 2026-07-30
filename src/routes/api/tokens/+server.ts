import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { listTokens, mintToken } from '$lib/server/tokens';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = requireUser(locals);
	return json({ tokens: await listTokens(user.username) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = requireUser(locals);
	const body = (await request.json().catch(() => ({}))) as { label?: string; expiresInDays?: number };
	const label = (body.label ?? '').trim() || 'mcp';
	const expiresAt =
		typeof body.expiresInDays === 'number' && body.expiresInDays > 0
			? new Date(Date.now() + body.expiresInDays * 86_400_000)
			: undefined;

	if (label.length > 64) throw error(400, 'label too long');
	const minted = await mintToken(user, label, expiresAt);
	return json({ id: minted.id, token: minted.token, label: minted.label }, { status: 201 });
};
