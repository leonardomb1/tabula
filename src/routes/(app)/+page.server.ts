import { loadIndexData } from '$lib/server/docsQuery';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, url, locals }) => {
	const { current } = await parent();
	if (!current) return { page: null, tags: [], sort: 'recent' as const, canWrite: false };
	return {
		...(await loadIndexData(current.id, url)),
		canWrite: locals.access?.can(current.id, 'editor') ?? false
	};
};
