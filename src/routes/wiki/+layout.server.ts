import { error, redirect } from '@sveltejs/kit';
import { readBranding } from '$lib/server/branding';
import { hostMatchesOrigin, wikiMode } from '$lib/server/wiki';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url, request }) => {
	const mode = wikiMode();
	if (mode === 'off') error(404, 'not found');
	if (mode === 'org' && !locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
	return {
		branding: readBranding(),
		signedIn: !!locals.user,
		// Reached on a hostname other than ORIGIN: this is the public entrance,
		// so offer no way into the app behind it.
		canSignIn: hostMatchesOrigin(request)
	};
};
