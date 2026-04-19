import { getAllDocs } from '$lib/server/docsIndex';
import { listForUser, getForUser, DEFAULT_WS_ID, PERSONAL_PREFIX, type Workspace } from '$lib/server/workspaces';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	// Build the visible workspace list. Unauthenticated visitors see only the
	// default team (mostly a defensive code path — / is auth-gated).
	const user = locals.user;
	const workspaces: Workspace[] = user
		? await listForUser(user)
		: [{ id: DEFAULT_WS_ID, name: 'Geral', kind: 'team' }];

	// Resolve current workspace: cookie first, then Personal default for the
	// logged-in user, then the default team.
	const cookieWs = cookies.get('docs_ws');
	let current: Workspace | null = null;
	if (cookieWs && user) current = await getForUser(user, cookieWs);
	if (!current && user) {
		current = workspaces.find((w) => w.id === `${PERSONAL_PREFIX}${user.username}`) ?? null;
	}
	if (!current) current = workspaces[0];

	const cached = await getAllDocs(current.id);
	const docs = cached
		.map((d) => {
			const tags = Array.isArray(d.frontmatter.tags) ? d.frontmatter.tags.map(String) : [];
			const date = d.frontmatter.date ? new Date(d.frontmatter.date as unknown as Date) : null;
			const description = typeof d.frontmatter.description === 'string' ? d.frontmatter.description : null;
			return { slug: d.slug, title: d.title, mtime: d.mtime, date, tags, description };
		})
		.sort((a, b) => (b.date ?? b.mtime).getTime() - (a.date ?? a.mtime).getTime());

	const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();

	return { docs, allTags, workspaces, currentWs: current };
};
