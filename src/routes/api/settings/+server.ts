import { json, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { saveUserSettings } from '$lib/server/userSettings';

const MAX = 80;

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = requireUser(locals);
	const body = (await request.json().catch(() => ({}))) as {
		fullName?: unknown;
		displayName?: unknown;
		onboarded?: unknown;
	};

	const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX) : undefined);

	const saved = await saveUserSettings(user.username, {
		fullName: text(body.fullName),
		displayName: text(body.displayName),
		onboarded: typeof body.onboarded === 'boolean' ? body.onboarded : undefined
	});

	return json({
		fullName: saved.fullName,
		displayName: saved.displayName,
		onboarded: saved.onboarded
	});
};
