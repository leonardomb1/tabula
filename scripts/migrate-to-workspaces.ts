#!/usr/bin/env bun
/**
 * One-shot migration to the workspace storage layout.
 *
 * Moves every existing top-level content/ asset into the `default` workspace:
 *   content/<slug>.md           → content/workspaces/default/<slug>.md
 *   content/attachments/<file>  → content/workspaces/default/attachments/<file>
 *   content/.history/<slug>/<x> → content/workspaces/default/.history/<slug>/<x>
 *
 * Leaves alone:
 *   content/covers/             — shared, intentionally cross-workspace
 *   content/branding/           — shared
 *   content/workspaces/         — already migrated
 *   content/workspaces.json     — the config file itself
 *
 * Also creates content/workspaces.json with a default entry if missing.
 *
 * Usage:
 *   bun scripts/migrate-to-workspaces.ts             # uses STORAGE from .env
 *   STORAGE=s3 bun scripts/migrate-to-workspaces.ts  # explicit
 *
 * Idempotent — running it again after a full migration is a no-op.
 */
import { list, getText, getBinary, putText, putBinary, remove, exists } from '../src/lib/server/storage';
import { DEFAULT_WS_ID } from '../src/lib/server/workspaces';

const SRC_PREFIX = 'content/';
const DST_PREFIX = `content/workspaces/${DEFAULT_WS_ID}/`;
const SHARED_DIRS = ['covers/', 'branding/', 'workspaces/'];
const SHARED_FILES = ['workspaces.json'];

interface Stats { moved: number; skipped: number; failed: number }

function shouldMove(relPath: string): boolean {
	if (SHARED_FILES.includes(relPath)) return false;
	for (const dir of SHARED_DIRS) {
		if (relPath === dir.slice(0, -1) || relPath.startsWith(dir)) return false;
	}
	return true;
}

function isBinary(rel: string): boolean {
	// markdown + history snapshots are text; everything else (attachments) is binary.
	return !rel.endsWith('.md');
}

async function ensureWorkspacesJson(): Promise<void> {
	const key = 'content/workspaces.json';
	if (await exists(key)) {
		console.log(`✓ ${key} already exists, leaving as-is`);
		return;
	}
	const body = JSON.stringify(
		{ workspaces: [{ id: DEFAULT_WS_ID, name: 'Geral', members: '*' }] },
		null,
		2
	) + '\n';
	await putText(key, body);
	console.log(`✓ created ${key}`);
}

async function migrateOne(srcKey: string, stats: Stats): Promise<void> {
	const rel = srcKey.slice(SRC_PREFIX.length);
	if (!shouldMove(rel)) {
		stats.skipped++;
		return;
	}
	const dstKey = `${DST_PREFIX}${rel}`;
	if (await exists(dstKey)) {
		console.log(`= skip (dst exists) ${rel}`);
		stats.skipped++;
		return;
	}
	try {
		if (isBinary(rel)) {
			const buf = await getBinary(srcKey);
			if (!buf) throw new Error('source missing');
			await putBinary(dstKey, buf);
		} else {
			const text = await getText(srcKey);
			if (text == null) throw new Error('source missing');
			await putText(dstKey, text);
		}
		await remove(srcKey);
		console.log(`→ ${rel}`);
		stats.moved++;
	} catch (e) {
		console.error(`✗ failed ${rel}: ${e instanceof Error ? e.message : String(e)}`);
		stats.failed++;
	}
}

async function main(): Promise<void> {
	console.log(`Migrating to workspace layout (default workspace = "${DEFAULT_WS_ID}")\n`);

	await ensureWorkspacesJson();

	const keys = await list(SRC_PREFIX);
	console.log(`Found ${keys.length} keys under content/\n`);

	const stats: Stats = { moved: 0, skipped: 0, failed: 0 };
	for (const { key } of keys) {
		await migrateOne(key, stats);
	}

	console.log(`\nDone. moved=${stats.moved} skipped=${stats.skipped} failed=${stats.failed}`);
	if (stats.failed > 0) process.exit(1);
}

await main();
