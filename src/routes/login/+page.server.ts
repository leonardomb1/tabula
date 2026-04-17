import { fail, redirect } from '@sveltejs/kit';
import { login, createSessionCookie, isOidcConfigured, isLdapConfigured } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/');
	return { oidc: isOidcConfigured(), ldap: isLdapConfigured() };
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const username = form.get('username')?.toString().trim() ?? '';
		const password = form.get('password')?.toString() ?? '';

		const result = await login(username, password);

		if (!result.ok) {
			return fail(401, { error: result.error, username });
		}

		cookies.set('docs_session', createSessionCookie(result.username, result.displayName), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 60 * 60 * 8
		});

		const redirectTo = url.searchParams.get('redirect') ?? '/';
		redirect(302, redirectTo);
	}
};
