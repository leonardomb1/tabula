import { getAllDocs } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Phase 1: public surface is fed from the default workspace only.
	// Phase 2 will iterate every workspace and merge any doc with public:true.
	const cached = await getAllDocs(DEFAULT_WS_ID);

	const docs = cached
		.filter((d) => d.frontmatter.public === true)
		.map((d) => {
			const tags = Array.isArray(d.frontmatter.tags) ? d.frontmatter.tags.map(String) : [];
			return { slug: d.slug, title: d.title, mtime: d.mtime, tags };
		})
		.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

	const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();

	return { docs, allTags };
};
