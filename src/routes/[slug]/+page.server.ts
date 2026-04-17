import { redirect, error } from '@sveltejs/kit';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

/**
 * Legacy /[slug] URL — redirect to the canonical /w/default/<slug>. Kept so
 * existing external links don't break. Pre-workspaces deployments stored
 * everything in the default workspace, so the migration target is fixed.
 */
export const load: PageServerLoad = async ({ params }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	redirect(307, `/w/${DEFAULT_WS_ID}/${slug}`);
};
