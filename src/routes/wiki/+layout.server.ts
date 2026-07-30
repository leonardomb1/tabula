import { error, redirect } from '@sveltejs/kit';
import { readBranding } from '$lib/server/branding';
import type { LayoutServerLoad } from './$types';

// 'off' hides the wiki entirely; 'org' serves it to signed-in users. The
// 'anonymous' level waits on the hardening batch and is deliberately absent.
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const mode = process.env.WIKI_MODE ?? 'org';
	if (mode === 'off') error(404, 'not found');
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
	return { branding: readBranding(), canEnterApp: true };
};
