import { listPublishedDocs } from '$lib/server/publication';
import { viewCounts } from '$lib/server/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const tag = url.searchParams.get('tag') ?? '';
	const all = await listPublishedDocs();
	const views = await viewCounts(all.map((d) => d.id));

	const tagCounts = new Map<string, number>();
	for (const d of all) for (const t of d.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

	const scoped = tag ? all.filter((d) => d.tags.includes(tag)) : all;
	const enriched = scoped.map((d) => ({
		id: d.id,
		title: d.title,
		publicSlug: d.publicSlug,
		workspaceId: d.workspaceId,
		workspaceName: d.workspaceName,
		tags: d.tags,
		updatedAt: d.updatedAt.toISOString(),
		views: views.get(d.id) ?? 0
	}));

	const featured = [...enriched].sort((a, b) => b.views - a.views).slice(0, 4);

	const byWorkspace = new Map<string, { id: string; name: string; docs: typeof enriched }>();
	for (const d of enriched) {
		const s = byWorkspace.get(d.workspaceId) ?? { id: d.workspaceId, name: d.workspaceName, docs: [] };
		s.docs.push(d);
		byWorkspace.set(d.workspaceId, s);
	}
	const sections = [...byWorkspace.values()]
		.map((s) => ({ ...s, docs: [...s.docs].sort((a, b) => b.views - a.views) }))
		.sort((a, b) => a.name.localeCompare(b.name));

	return {
		featured,
		sections,
		tag,
		tags: [...tagCounts.entries()]
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([name, count]) => ({ name, count }))
	};
};
