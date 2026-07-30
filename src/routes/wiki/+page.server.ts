import { listPublishedDocs } from '$lib/server/publication';
import { viewCounts } from '$lib/server/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const tag = url.searchParams.get('tag') ?? '';
	const all = await listPublishedDocs();
	const views = await viewCounts(all.map((d) => d.id));

	const tagCounts = new Map<string, number>();
	for (const d of all) for (const t of d.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

	const docs = (tag ? all.filter((d) => d.tags.includes(tag)) : all).map((d) => ({
		title: d.title,
		publicSlug: d.publicSlug,
		tags: d.tags,
		updatedAt: d.updatedAt.toISOString(),
		views: views.get(d.id) ?? 0
	}));

	return {
		docs,
		tag,
		tags: [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([name, count]) => ({ name, count }))
	};
};
