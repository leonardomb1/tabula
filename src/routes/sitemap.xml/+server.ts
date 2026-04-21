import { getAllDocs } from '$lib/server/docsIndex';
import { listAllWorkspaces } from '$lib/server/workspacesAdmin';
import { slugifyTitle } from '$lib/ids';
import type { RequestHandler } from './$types';

/**
 * Sitemap for the public surface of the app. Lists every doc with
 * `public: true` plus the `/public` index itself, so crawlers (search
 * engines + AI agents) can discover the full public inventory without
 * having to scrape the index page.
 *
 * Canonical form is `/public/<slug>/<slugifiedTitle>` — the reader
 * 301-redirects bare `/public/<slug>` to this form, so listing the
 * canonical variant is what we want crawlers to index.
 *
 * Rendered on every request (no caching) because the underlying doc
 * cache is already in-memory and iteration is cheap; the upstream
 * `content/workspaces/*` data changes every time a doc is published.
 * If this ever scales past ~10k URLs we'd move to a gzipped
 * sitemap-index shape — not worth the code today.
 */

function escapeXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function toIsoDate(d: Date | string | null | undefined): string | null {
	if (!d) return null;
	const parsed = typeof d === 'string' ? new Date(d) : d;
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString().split('T')[0];
}

export const GET: RequestHandler = async ({ url }) => {
	const origin = url.origin;
	const workspaces = await listAllWorkspaces();

	// Collect every public doc across workspaces. Personal workspaces
	// aren't in the DB-backed list (they're derived per-user) so any
	// `public: true` doc in a personal space is currently invisible
	// here — same gap the /public index already has.
	type Entry = {
		slug: string;
		title: string;
		lastmod: string | null;
	};
	const entries: Entry[] = [];
	for (const ws of workspaces) {
		const docs = await getAllDocs(ws.id);
		for (const d of docs) {
			if (d.frontmatter.public !== true) continue;
			const dateRaw = d.frontmatter.date as unknown;
			const lastmod =
				toIsoDate(
					typeof dateRaw === 'string' || dateRaw instanceof Date
						? (dateRaw as string | Date)
						: null
				) ?? toIsoDate(d.mtime);
			entries.push({ slug: d.slug, title: d.title, lastmod });
		}
	}

	// Stable order — newest first so crawlers following the list pick
	// fresh content before older archive entries.
	entries.sort((a, b) => (b.lastmod ?? '').localeCompare(a.lastmod ?? ''));

	const indexLastmod = toIsoDate(new Date());

	const urls: string[] = [];

	// Public index — weekly-ish freshness; even a site with static docs
	// has its index re-ranked as docs are added / removed.
	urls.push(
		`  <url>\n` +
			`    <loc>${escapeXml(`${origin}/public`)}</loc>\n` +
			(indexLastmod ? `    <lastmod>${indexLastmod}</lastmod>\n` : '') +
			`    <changefreq>weekly</changefreq>\n` +
			`  </url>`
	);

	for (const e of entries) {
		const canonical = `${origin}/public/${e.slug}${
			slugifyTitle(e.title) ? `/${slugifyTitle(e.title)}` : ''
		}`;
		urls.push(
			`  <url>\n` +
				`    <loc>${escapeXml(canonical)}</loc>\n` +
				(e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : '') +
				`    <changefreq>monthly</changefreq>\n` +
				`  </url>`
		);
	}

	const body =
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
		urls.join('\n') +
		`\n</urlset>\n`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			// Short cache so updates propagate quickly but we don't hammer
			// the doc index on every crawler request.
			'Cache-Control': 'public, max-age=300'
		}
	});
};
