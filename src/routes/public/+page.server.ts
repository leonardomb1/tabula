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
			const date = d.frontmatter.date ? new Date(d.frontmatter.date as unknown as Date) : null;
			const description = typeof d.frontmatter.description === 'string' ? d.frontmatter.description : null;
			return { slug: d.slug, title: d.title, mtime: d.mtime, date, tags, description };
		})
		.sort((a, b) => (b.date ?? b.mtime).getTime() - (a.date ?? a.mtime).getTime());

	const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();

	return { docs, allTags };
};
