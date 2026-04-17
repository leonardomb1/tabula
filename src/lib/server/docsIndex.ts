/**
 * In-memory index of markdown docs, sharded per workspace.
 *
 * Each workspace owns its own Map<slug, CachedDoc> + MiniSearch index, lazy-
 * built on first access. Reads are RAM-local after the cold start; writes
 * keep both cache and search index in sync. Attachments + history are also
 * per-workspace; only covers + branding live in shared content/ paths.
 */
import MiniSearch from 'minisearch';
import { list, getText } from './storage';
import { wsPrefix } from './workspaces';
import { parseFrontmatter, type Frontmatter } from '$lib/markdown';

// Shared (cross-workspace) prefixes — used by routes that don't care about ws.
const COVERS_PREFIX = 'content/covers/';
const BRANDING_PREFIX = 'content/branding/';

export interface CachedDoc {
	slug: string;
	source: string;
	frontmatter: Frontmatter;
	body: string;
	title: string;
	mtime: Date;
}

interface Shard {
	cache: Map<string, CachedDoc>;
	search: MiniSearch;
	initPromise: Promise<void> | null;
	ready: boolean;
}

const shards = new Map<string, Shard>();

function newSearch(): MiniSearch {
	return new MiniSearch({
		idField: 'slug',
		fields: ['title', 'body'],
		storeFields: ['slug', 'title'],
		searchOptions: { boost: { title: 2 }, prefix: true, fuzzy: 0.2 }
	});
}

function getShard(wsId: string): Shard {
	let s = shards.get(wsId);
	if (!s) {
		s = { cache: new Map(), search: newSearch(), initPromise: null, ready: false };
		shards.set(wsId, s);
	}
	return s;
}

function parseDoc(slug: string, source: string, mtime: Date): CachedDoc {
	const { frontmatter, body } = parseFrontmatter(source);
	const titleMatch = body.match(/^#\s+(.+)$/m);
	const title = frontmatter.title ?? (titleMatch ? titleMatch[1] : slug);
	return { slug, source, frontmatter, body, title, mtime };
}

/** Slug for a key under content/workspaces/<wsId>/. Returns null for nested
 *  paths (attachments, history) and non-.md files. */
function keyToSlug(wsId: string, key: string): string | null {
	const prefix = wsPrefix(wsId);
	if (!key.startsWith(prefix)) return null;
	const rest = key.slice(prefix.length);
	if (rest.includes('/')) return null;
	if (!rest.endsWith('.md')) return null;
	return rest.slice(0, -3);
}

export function slugToKey(wsId: string, slug: string): string {
	return `${wsPrefix(wsId)}${slug}.md`;
}

async function doInit(wsId: string, shard: Shard): Promise<void> {
	const keys = await list(wsPrefix(wsId));
	const mdKeys = keys
		.map((k) => ({ ...k, slug: keyToSlug(wsId, k.key) }))
		.filter((k): k is typeof k & { slug: string } => k.slug !== null);

	await Promise.all(
		mdKeys.map(async ({ key, slug, lastModified }) => {
			const source = await getText(key);
			if (source == null) return;
			const doc = parseDoc(slug, source, lastModified ?? new Date());
			shard.cache.set(slug, doc);
			shard.search.add({ slug, title: doc.title, body: doc.body });
		})
	);
	shard.ready = true;
}

async function ensureReady(wsId: string): Promise<Shard> {
	const shard = getShard(wsId);
	if (shard.ready) return shard;
	if (!shard.initPromise) shard.initPromise = doInit(wsId, shard);
	await shard.initPromise;
	return shard;
}

export async function getDoc(wsId: string, slug: string): Promise<CachedDoc | null> {
	const shard = await ensureReady(wsId);
	return shard.cache.get(slug) ?? null;
}

export async function getAllDocs(wsId: string): Promise<CachedDoc[]> {
	const shard = await ensureReady(wsId);
	return [...shard.cache.values()];
}

export async function upsertDoc(wsId: string, slug: string, source: string): Promise<CachedDoc> {
	const shard = await ensureReady(wsId);
	const doc = parseDoc(slug, source, new Date());
	const existed = shard.cache.has(slug);
	shard.cache.set(slug, doc);
	const fields = { slug, title: doc.title, body: doc.body };
	if (existed) shard.search.replace(fields);
	else shard.search.add(fields);
	return doc;
}

export async function removeDoc(wsId: string, slug: string): Promise<void> {
	const shard = await ensureReady(wsId);
	if (!shard.cache.has(slug)) return;
	shard.cache.delete(slug);
	shard.search.discard(slug);
}

export async function renameDoc(wsId: string, oldSlug: string, newSlug: string): Promise<void> {
	const shard = await ensureReady(wsId);
	const doc = shard.cache.get(oldSlug);
	if (!doc) return;
	shard.cache.delete(oldSlug);
	shard.search.discard(oldSlug);
	const renamed: CachedDoc = { ...doc, slug: newSlug };
	shard.cache.set(newSlug, renamed);
	shard.search.add({ slug: newSlug, title: renamed.title, body: renamed.body });
}

function stripMarkdown(md: string): string {
	return md
		.replace(/```[\s\S]*?```/g, '')
		.replace(/`[^`]+`/g, '')
		.replace(/!\[.*?\]\(.*?\)/g, '')
		.replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
		.replace(/^\s*[-*+>]\s+/gm, '')
		.replace(/\n{2,}/g, '\n')
		.trim();
}

function buildExcerpt(plain: string, term: string, radius = 120): string {
	const lower = plain.toLowerCase();
	const idx = lower.indexOf(term.toLowerCase());
	if (idx === -1) return plain.slice(0, radius * 2);

	const start = Math.max(0, idx - radius);
	const end = Math.min(plain.length, idx + term.length + radius);
	let snippet = plain.slice(start, end);
	if (start > 0) snippet = '…' + snippet;
	if (end < plain.length) snippet += '…';

	const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
	return snippet.replace(re, '<mark>$1</mark>');
}

export interface SearchResult {
	slug: string;
	title: string;
	excerpt: string;
	matchIn: 'title' | 'slug' | 'content';
	wsId: string;
}

export async function search(wsId: string, query: string, limit = 10): Promise<SearchResult[]> {
	const shard = await ensureReady(wsId);
	const q = query.trim();
	if (q.length < 2) return [];

	const hits = shard.search.search(q);
	const qLow = q.toLowerCase();
	const out: SearchResult[] = [];

	for (const hit of hits.slice(0, limit)) {
		const doc = shard.cache.get(hit.id as string);
		if (!doc) continue;
		const term = (hit.terms as string[])[0] ?? q;
		const plain = stripMarkdown(doc.body);
		const matchIn: SearchResult['matchIn'] =
			doc.title.toLowerCase().includes(qLow)
				? 'title'
				: doc.slug.toLowerCase().includes(qLow)
					? 'slug'
					: 'content';
		out.push({ slug: doc.slug, title: doc.title, excerpt: buildExcerpt(plain, term), matchIn, wsId });
	}
	return out;
}

/** Search across multiple workspaces and merge by score order (best per-shard
 *  first, then concatenated). For now no global re-ranking. */
export async function searchAcross(wsIds: string[], query: string, limit = 10): Promise<SearchResult[]> {
	const all = await Promise.all(wsIds.map((id) => search(id, query, limit)));
	return all.flat().slice(0, limit);
}

export async function findBacklinks(
	wsId: string,
	targetSlug: string
): Promise<{ slug: string; title: string }[]> {
	const shard = await ensureReady(wsId);
	const re = new RegExp(`\\[\\[${targetSlug}(?:\\|[^\\]]+)?\\]\\]`);
	const out: { slug: string; title: string }[] = [];
	for (const doc of shard.cache.values()) {
		if (doc.slug === targetSlug) continue;
		if (re.test(doc.source)) out.push({ slug: doc.slug, title: doc.title });
	}
	return out;
}

/** Storage prefixes for routes that touch storage directly (attachments,
 *  history, covers, branding). attachments + history are per-workspace; the
 *  rest are shared. */
export function attachmentsPrefix(wsId: string): string {
	return `${wsPrefix(wsId)}attachments/`;
}
export function historyPrefix(wsId: string): string {
	return `${wsPrefix(wsId)}.history/`;
}

export const prefixes = {
	covers: COVERS_PREFIX,
	branding: BRANDING_PREFIX
};
