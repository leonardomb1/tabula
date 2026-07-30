import { json, type RequestHandler } from '@sveltejs/kit';
import { SESSION_COOKIE, cookieOptions, issueToken, login } from '$lib/server/auth';
import { recordDirectorySnapshot } from '$lib/server/userSettings';
import { ensureWorkspace } from '$lib/server/workspaces';
import { personalWorkspaceId } from '$lib/server/ids';
import { throttled } from '$lib/server/throttle';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as {
		identifier?: string;
		password?: string;
	};
	if (!body.identifier || !body.password) {
		return json({ error: 'identifier and password are required' }, { status: 400 });
	}
	if (throttled(`login:${body.identifier.toLowerCase()}:${getClientAddress()}`)) {
		return json({ error: 'too many attempts' }, { status: 429 });
	}

	let result;
	try {
		result = await login(body.identifier, body.password);
	} catch {
		return json({ error: 'auth service unavailable' }, { status: 503 });
	}

	if (!result.ok) {
		const status =
			result.reason === 'locked'
				? 423
				: result.reason === 'disabled' || result.reason === 'blocked' || result.reason === 'not_allowed'
					? 403
					: 401;
		return json({ error: result.reason, code: result.code }, { status });
	}

	const { user } = result;
	await recordDirectorySnapshot(user).catch(() => {});
	await ensureWorkspace(personalWorkspaceId(user.username), user.displayName ?? user.username, 'personal').catch(
		() => {}
	);
	cookies.set(SESSION_COOKIE, issueToken(user), cookieOptions());
	return json({
		user: {
			username: user.username,
			displayName: user.displayName,
			mail: user.mail,
			title: user.title,
			employeeId: user.employeeId,
			costCenterCode: user.costCenterCode,
			costCenterDescription: user.costCenterDescription,
			isPlatformAdmin: user.isPlatformAdmin
		}
	});
};
