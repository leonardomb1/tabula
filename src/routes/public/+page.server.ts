import { getAllDocs } from '$lib/server/docsIndex';
import { listAllWorkspaces } from '$lib/server/workspacesAdmin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Scan every workspace (not just `default`) and surface any doc opting
	// into public access. Same pattern the /public/[slug] page uses —
	// ids are globally unique but stored per-workspace, so we have to
	// iterate the workspace list and merge hits. Personal workspaces
	// aren't in the DB-backed list (they're derived per-user), so any
	// `public: true` doc in a personal space is currently invisible
	// here — flag that as a known gap rather than papering over it.
	const workspaces = await listAllWorkspaces();

	const bundles = await Promise.all(
		workspaces.map(async (ws) => {
			const cached = await getAllDocs(ws.id);
			return cached
				.filter((d) => d.frontmatter.public === true)
				.map((d) => {
					const tags = Array.isArray(d.frontmatter.tags)
						? d.frontmatter.tags.map(String)
						: [];
					const date = d.frontmatter.date
						? new Date(d.frontmatter.date as unknown as Date)
						: null;
					const description =
						typeof d.frontmatter.description === 'string'
							? d.frontmatter.description
							: null;
					return {
						slug: d.slug,
						title: d.title,
						mtime: d.mtime,
						date,
						tags,
						description
					};
				});
		})
	);

	const docs = bundles
		.flat()
		.sort((a, b) => (b.date ?? b.mtime).getTime() - (a.date ?? a.mtime).getTime());

	const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();

	return { docs, allTags };
};
