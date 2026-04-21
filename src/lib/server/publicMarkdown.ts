/**
 * Markdown-for-agents responders for the public surface. When a client
 * sends `Accept: text/markdown`, these are what we return instead of the
 * HTML-rendered SvelteKit page — same content, agent-friendly shape.
 *
 * Two shapes:
 *   - Doc: the raw markdown source (which is what we already store).
 *   - Index: a generated list of public docs with links, built fresh
 *     per request from the same cache the HTML index uses so the two
 *     views never diverge.
 *
 * Personal workspaces aren't included — they aren't in the DB-backed
 * `listAllWorkspaces()` and so they can't host public-discoverable
 * docs (same boundary as the HTML `/public` page and the sitemap).
 */
import { getAllDocs, getDoc } from './docsIndex';
import { listAllWorkspaces } from './workspacesAdmin';
import { slugifyTitle } from '../ids';

/**
 * Find a public-visible doc by slug, scanning every team workspace.
 * Returns the raw markdown source (with frontmatter) plus a couple of
 * fields the caller may want to use for headers / linking.
 */
export async function findPublicDocMarkdown(
	slug: string
): Promise<{ source: string; title: string; mtime: Date } | null> {
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return null;
	const workspaces = await listAllWorkspaces();
	for (const ws of workspaces) {
		const hit = await getDoc(ws.id, slug);
		if (hit && hit.frontmatter.public === true) {
			return { source: hit.source, title: hit.title, mtime: hit.mtime };
		}
	}
	return null;
}

/**
 * Build the markdown equivalent of the `/public` HTML index — a bulleted
 * list of every public doc across team workspaces, linking to each
 * doc's canonical URL. `origin` is the request's scheme+host so the
 * list works when consumed outside the page context (e.g. curl).
 */
export async function buildPublicIndexMarkdown(origin: string): Promise<string> {
	const workspaces = await listAllWorkspaces();
	type Entry = { slug: string; title: string; description: string | null; date: Date | null; mtime: Date };
	const entries: Entry[] = [];
	for (const ws of workspaces) {
		const docs = await getAllDocs(ws.id);
		for (const d of docs) {
			if (d.frontmatter.public !== true) continue;
			const dateRaw = d.frontmatter.date;
			// Frontmatter `date` is typed as a string (YAML gives us the
			// raw value pre-parse). Construct a Date from it and drop it
			// if the parse fails.
			const parsedDate = dateRaw ? new Date(dateRaw) : null;
			const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
			const description =
				typeof d.frontmatter.description === 'string' ? d.frontmatter.description : null;
			entries.push({
				slug: d.slug,
				title: d.title,
				description,
				date,
				mtime: d.mtime
			});
		}
	}
	// Newest first — same order as the HTML view.
	entries.sort(
		(a, b) => (b.date ?? b.mtime).getTime() - (a.date ?? a.mtime).getTime()
	);

	const lines: string[] = [];
	lines.push('# Público');
	lines.push('');
	lines.push(
		`Lista de documentos públicos. Total: ${entries.length} ${entries.length === 1 ? 'documento' : 'documentos'}.`
	);
	lines.push('');

	if (entries.length === 0) {
		lines.push('_Nenhum documento público disponível no momento._');
		lines.push('');
		return lines.join('\n');
	}

	for (const e of entries) {
		const titleSeg = slugifyTitle(e.title);
		const url = titleSeg
			? `${origin}/public/${e.slug}/${titleSeg}`
			: `${origin}/public/${e.slug}`;
		const date = e.date ?? e.mtime;
		const dateStr = date.toISOString().split('T')[0];
		lines.push(`- [${e.title}](${url}) — ${dateStr}`);
		if (e.description) {
			// Indent the description so it's visually attached to the bullet
			// without breaking list semantics.
			lines.push(`  ${e.description}`);
		}
	}
	lines.push('');
	return lines.join('\n');
}

/**
 * True if the Accept header expresses a preference for markdown. We
 * match any entry starting with `text/markdown` (ignoring q-values and
 * parameters — a client that bothered to set the header at all is
 * unambiguously opting in). A bare wildcard accept is not enough; we
 * only switch on an explicit opt-in.
 */
export function acceptsMarkdown(acceptHeader: string | null): boolean {
	if (!acceptHeader) return false;
	return acceptHeader
		.split(',')
		.some((part) => part.trim().toLowerCase().startsWith('text/markdown'));
}
