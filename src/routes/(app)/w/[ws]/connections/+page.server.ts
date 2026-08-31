import { requireRole } from '$lib/server/apiGuards';
import { getDocBySlug } from '$lib/server/docs';
import {
	getBacklinksWithContext,
	getRelatedDocs,
	getUnlinkedMentions,
	getWorkspaceGraph,
	type DocConnection
} from '$lib/server/connections';
import type { PageServerLoad } from './$types';

const strip = (d: DocConnection) => ({
	id: d.id,
	slug: d.slug,
	title: d.title,
	excerpt: d.excerpt ?? ''
});

export const load: PageServerLoad = async ({ params, locals, url }) => {
	requireRole(locals, params.ws, 'viewer');
	const graph = await getWorkspaceGraph(params.ws);

	const slug = url.searchParams.get('doc');
	const doc = slug ? await getDocBySlug(params.ws, slug) : null;
	if (!doc) return { graph, selected: null };

	const [backlinks, related, mentions] = await Promise.all([
		getBacklinksWithContext(doc),
		getRelatedDocs(doc),
		getUnlinkedMentions(doc)
	]);
	return {
		graph,
		selected: {
			id: doc.id,
			slug: doc.slug,
			title: doc.title,
			tags: doc.tags,
			backlinks: backlinks.map(strip),
			related: related.map(strip),
			mentions: mentions.map(strip)
		}
	};
};
