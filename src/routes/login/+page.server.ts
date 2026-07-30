import { fail, redirect, type Actions } from '@sveltejs/kit';
import * as m from '$lib/paraglide/messages';
import { SESSION_COOKIE, cookieOptions, issueToken, login } from '$lib/server/auth';
import { recordDirectorySnapshot } from '$lib/server/userSettings';
import type { PageServerLoad } from './$types';

function safeRedirect(target: string | null): string {
	return target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const identifier = String(data.get('identifier') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (!identifier || !password) {
			return fail(400, { error: m.login_error_required(), identifier });
		}

		let result;
		try {
			result = await login(identifier, password);
		} catch {
			return fail(503, { error: m.login_error_unavailable(), identifier });
		}

		if (!result.ok) {
			const message =
				result.reason === 'locked'
					? m.login_error_locked()
					: result.reason === 'disabled'
						? m.login_error_disabled()
						: m.login_error_invalid();
			return fail(result.reason === 'invalid' ? 401 : 403, { error: message, identifier });
		}

		await recordDirectorySnapshot(result.user).catch(() => {});

		cookies.set(SESSION_COOKIE, issueToken(result.user), cookieOptions());
		redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
	}
};
