/**
 * One-way git mirror: a repo workspace's docs are a projection of a branch.
 * Sync shallow-clones, diffs against what is stored (per-file content hash in
 * frontmatter), and only writes real changes — so the semantic indexer's rev
 * predicate keeps re-embedding incremental for free. Docs in a repo workspace
 * are read-only everywhere else; the sync engine is the single writer.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { docLinks, docs, workspaces, type Doc } from '../db/schema';
import { createDoc, softDeleteDoc, updateDoc } from '../docs';
import { getWorkspace } from '../workspaces';
import { extractImports } from './imports';

export interface RepoConfig {
	url: string;
	branch: string;
	/** Basic-auth user for the token; 'oauth2' works for GitHub and GitLab. */
	username?: string;
	token?: string;
	/** Path prefixes to include; empty means the whole tree. */
	include?: string[];
	lastCommit?: string;
	lastSyncAt?: string;
	lastError?: string | null;
	fileCount?: number;
	skipped?: SkipCounts;
}

export interface SkipCounts {
	dotfile: number;
	excluded: number;
	oversized: number;
	binary: number;
}

export interface SyncResult {
	commit: string;
	unchanged: boolean;
	created: number;
	updated: number;
	deleted: number;
	files: number;
	skipped: SkipCounts;
}

const SYNC_ACTOR = 'repo-sync';
const MAX_FILE_BYTES = 300_000;

const EXCLUDED_DIRS = new Set([
	'.git',
	'node_modules',
	'dist',
	'build',
	'.svelte-kit',
	'.next',
	'vendor',
	'target',
	'__pycache__',
	'.venv',
	'coverage'
]);
const EXCLUDED_FILES =
	/(^|\/)(package-lock\.json|bun\.lock[b]?|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|go\.sum)$|\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|otf|eot|pdf|zip|gz|tar|jar|exe|dll|so|dylib|bin|mp[34]|mov|min\.js|min\.css|map)$/i;

const FENCE_LANG: Record<string, string> = {
	ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
	py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', rb: 'ruby',
	php: 'php', cs: 'csharp', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp',
	sh: 'bash', bash: 'bash', sql: 'sql', yml: 'yaml', yaml: 'yaml',
	json: 'json', toml: 'toml', html: 'html', css: 'css', scss: 'scss',
	svelte: 'svelte', vue: 'vue', tf: 'hcl', dockerfile: 'dockerfile', typ: 'typst'
};

/** Deterministic, URL-safe slug for a repo path; the real path lives in frontmatter. */
export function pathSlug(filePath: string): string {
	return filePath
		.toLowerCase()
		.replace(/[^a-z0-9./_-]+/g, '-')
		.replace(/\//g, '~');
}

function fenceLang(filePath: string): string {
	const base = filePath.split('/').pop() ?? '';
	if (/^dockerfile/i.test(base)) return 'dockerfile';
	const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
	return FENCE_LANG[ext] ?? '';
}

/** Markdown stays markdown; anything else becomes a fenced code block. */
function docSource(filePath: string, content: string): string {
	if (/\.(md|markdown)$/i.test(filePath)) return content;
	const runs = content.match(/`{3,}/g);
	const fence = '`'.repeat(Math.max(3, ...(runs ?? []).map((r) => r.length + 1)));
	return `${fence}${fenceLang(filePath)}\n${content}\n${fence}\n`;
}

function contentHash(content: string): string {
	return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function collectFiles(
	root: string,
	include: string[]
): Promise<{ files: Map<string, string>; skipped: SkipCounts }> {
	const files = new Map<string, string>();
	const skipped: SkipCounts = { dotfile: 0, excluded: 0, oversized: 0, binary: 0 };
	async function walk(dir: string) {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name);
			const rel = path.relative(root, abs).replaceAll(path.sep, '/');
			if (entry.isDirectory()) {
				if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith('.')) await walk(abs);
				continue;
			}
			if (!entry.isFile()) continue;
			// Dotfiles stay out wholesale — .env-style files must never be mirrored.
			if (entry.name.startsWith('.')) {
				skipped.dotfile++;
				continue;
			}
			if (EXCLUDED_FILES.test(rel)) {
				skipped.excluded++;
				continue;
			}
			if (include.length && !include.some((p) => rel === p || rel.startsWith(p.replace(/\/$/, '') + '/')))
				continue;
			if ((await stat(abs)).size > MAX_FILE_BYTES) {
				skipped.oversized++;
				continue;
			}
			const buf = await readFile(abs);
			if (buf.subarray(0, 8192).includes(0)) {
				skipped.binary++;
				continue;
			}
			files.set(rel, buf.toString('utf8'));
		}
	}
	await walk(root);
	return { files, skipped };
}

function repoPathOf(doc: Doc): string | null {
	const p = (doc.frontmatter as Record<string, unknown>)?.repoPath;
	return typeof p === 'string' ? p : null;
}

const running = new Set<string>();

export async function syncRepoWorkspace(
	workspaceId: string,
	opts: { force?: boolean } = {}
): Promise<SyncResult> {
	if (running.has(workspaceId)) throw new Error('sync already running for this workspace');
	running.add(workspaceId);
	try {
		return await runSync(workspaceId, opts);
	} catch (err) {
		await saveConfigPatch(workspaceId, {
			lastError: err instanceof Error ? err.message : String(err)
		});
		throw err;
	} finally {
		running.delete(workspaceId);
	}
}

async function saveConfigPatch(workspaceId: string, patch: Partial<RepoConfig>): Promise<void> {
	await db
		.update(workspaces)
		.set({ repo: sql`coalesce(${workspaces.repo}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
		.where(eq(workspaces.id, workspaceId));
}

async function runSync(workspaceId: string, opts: { force?: boolean }): Promise<SyncResult> {
	const ws = await getWorkspace(workspaceId);
	const cfg = ws?.repo as RepoConfig | null;
	if (!ws || !cfg?.url || !cfg.branch) throw new Error('workspace has no repository configured');

	const [{ default: git }, { default: http }] = await Promise.all([
		import('isomorphic-git'),
		import('isomorphic-git/http/node')
	]);
	const fs = await import('node:fs');

	const dir = await mkdtemp(path.join(tmpdir(), 'tabula-repo-'));
	try {
		await git.clone({
			fs,
			http,
			dir,
			url: cfg.url,
			ref: cfg.branch,
			singleBranch: true,
			depth: 1,
			...(cfg.token
				? { onAuth: () => ({ username: cfg.username || 'oauth2', password: cfg.token }) }
				: {})
		});
		const commit = await git.resolveRef({ fs, dir, ref: 'HEAD' });

		if (!opts.force && cfg.lastCommit === commit) {
			await saveConfigPatch(workspaceId, { lastSyncAt: new Date().toISOString(), lastError: null });
			return {
				commit,
				unchanged: true,
				created: 0,
				updated: 0,
				deleted: 0,
				files: cfg.fileCount ?? 0,
				skipped: cfg.skipped ?? { dotfile: 0, excluded: 0, oversized: 0, binary: 0 }
			};
		}

		const { files, skipped } = await collectFiles(dir, cfg.include ?? []);
		const fileSet = new Set(files.keys());

		// Every doc in the workspace, soft-deleted included: a file that comes
		// back must resurrect its doc, not fight it over the slug.
		const existing = await db.select().from(docs).where(eq(docs.workspaceId, workspaceId));
		const byPath = new Map<string, Doc>();
		for (const d of existing) {
			const p = repoPathOf(d);
			if (p) byPath.set(p, d);
		}

		let created = 0;
		let updated = 0;
		const changedDocs = new Map<string, string>();

		for (const [filePath, content] of files) {
			const hash = contentHash(content);
			const current = byPath.get(filePath);
			const frontmatter = { repoPath: filePath, repoHash: hash };
			const tags = [filePath.split('/')[0] === filePath ? 'root' : filePath.split('/')[0]];

			if (!current) {
				const doc = await createDoc({
					workspaceId,
					slug: pathSlug(filePath),
					title: filePath,
					mode: 'markdown',
					source: docSource(filePath, content),
					tags,
					frontmatter,
					actor: SYNC_ACTOR
				});
				byPath.set(filePath, doc);
				changedDocs.set(filePath, doc.id);
				created++;
				continue;
			}

			const priorHash = (current.frontmatter as Record<string, unknown>)?.repoHash;
			if (current.deletedAt === null && priorHash === hash) continue;

			if (current.deletedAt !== null) {
				await db
					.update(docs)
					.set({ deletedAt: null })
					.where(eq(docs.id, current.id));
			}
			await updateDoc(
				current.id,
				{ title: filePath, source: docSource(filePath, content), tags, frontmatter },
				SYNC_ACTOR
			);
			changedDocs.set(filePath, current.id);
			updated++;
		}

		let deleted = 0;
		for (const [p, d] of byPath) {
			if (!fileSet.has(p) && d.deletedAt === null) {
				await softDeleteDoc(d.id, SYNC_ACTOR);
				deleted++;
			}
		}

		// Import edges for changed docs (updateDoc wiped their old rows).
		for (const [filePath, docId] of changedDocs) {
			const targets = extractImports(filePath, files.get(filePath) ?? '', fileSet);
			await db.delete(docLinks).where(eq(docLinks.sourceDocId, docId));
			const rows = targets
				.map((t) => byPath.get(t))
				.filter((d): d is Doc => !!d)
				.map((d) => ({ sourceDocId: docId, targetSlug: d.slug, targetDocId: d.id }));
			if (rows.length) await db.insert(docLinks).values(rows);
		}

		await db.update(workspaces).set({ kind: 'repo' }).where(eq(workspaces.id, workspaceId));
		await saveConfigPatch(workspaceId, {
			lastCommit: commit,
			lastSyncAt: new Date().toISOString(),
			lastError: null,
			fileCount: files.size,
			skipped
		});

		return { commit, unchanged: false, created, updated, deleted, files: files.size, skipped };
	} finally {
		await rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

/** Docs in a repo workspace are written only by sync; every other writer asks first. */
export async function docsWritable(workspaceId: string): Promise<boolean> {
	const ws = await getWorkspace(workspaceId);
	return ws?.kind !== 'repo';
}
