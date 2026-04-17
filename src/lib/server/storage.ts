/**
 * Storage abstraction over local filesystem (Bun.file) and S3-compatible
 * object storage (Bun.S3Client). The STORAGE env var toggles the backend.
 *
 * Keys are opaque strings. In local mode they're treated as filesystem paths
 * relative to the working directory (e.g. "content/meta-doc.md"). In S3 mode
 * they're S3 object keys with the same layout (no leading slash).
 */
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// Using the global Bun namespace (typed via bun-types) — importing the "bun"
// module fails during Vite/Rollup build since the bundler can't resolve it.

export type StorageMode = 'local' | 's3';

function readMode(): StorageMode {
	const v = (process.env.STORAGE ?? 'local').toLowerCase();
	return v === 's3' ? 's3' : 'local';
}

const mode: StorageMode = readMode();

const s3 =
	mode === 's3'
		? new Bun.S3Client({
				endpoint: requireEnv('S3_ENDPOINT'),
				accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
				secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
				bucket: requireEnv('S3_BUCKET'),
				region: process.env.S3_REGION ?? 'auto'
			})
		: null;

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} must be set when STORAGE=s3`);
	return v;
}

function openFile(key: string) {
	return s3 ? s3.file(key) : Bun.file(key);
}

export function storageMode(): StorageMode {
	return mode;
}

export async function exists(key: string): Promise<boolean> {
	return openFile(key).exists();
}

export async function getText(key: string): Promise<string | null> {
	const f = openFile(key);
	if (!(await f.exists())) return null;
	return f.text();
}

export async function getBinary(key: string): Promise<ArrayBuffer | null> {
	const f = openFile(key);
	if (!(await f.exists())) return null;
	return f.arrayBuffer();
}

export async function putText(key: string, content: string): Promise<void> {
	if (s3) {
		await s3.file(key).write(content);
	} else {
		ensureLocalDir(key);
		await Bun.write(key, content);
	}
}

export async function putBinary(
	key: string,
	data: ArrayBuffer | Uint8Array | Blob,
	opts?: { type?: string }
): Promise<void> {
	if (s3) {
		await s3.file(key).write(data as any, opts);
	} else {
		ensureLocalDir(key);
		await Bun.write(key, data as any);
	}
}

export async function remove(key: string): Promise<void> {
	const f = openFile(key);
	if (!(await f.exists())) return;
	await (f as any).delete();
}

export interface ListedKey {
	key: string;
	size?: number;
	lastModified?: Date;
}

export async function list(prefix: string): Promise<ListedKey[]> {
	if (s3) return listS3(prefix);
	return listLocal(prefix);
}

async function listS3(prefix: string): Promise<ListedKey[]> {
	const out: ListedKey[] = [];
	let startAfter: string | undefined;
	// Paginate; R2/S3 returns up to 1000 per call.
	for (let guard = 0; guard < 100; guard++) {
		const res = await s3!.list({ prefix, maxKeys: 1000, startAfter });
		const items = res.contents ?? [];
		for (const it of items) {
			out.push({
				key: it.key,
				size: it.size,
				lastModified: it.lastModified ? new Date(it.lastModified) : undefined
			});
		}
		if (!res.isTruncated || items.length === 0) break;
		startAfter = items[items.length - 1].key;
	}
	return out;
}

async function listLocal(prefix: string): Promise<ListedKey[]> {
	// Trim trailing slash so a prefix "content/" scans "./content".
	const dir = prefix.replace(/\/+$/, '');
	if (!existsSync(dir)) return [];
	const glob = new Bun.Glob('**/*');
	const out: ListedKey[] = [];
	for await (const rel of glob.scan({ cwd: dir, onlyFiles: true, dot: true })) {
		const key = `${dir}/${rel}`;
		const f = Bun.file(key);
		out.push({ key, size: f.size, lastModified: new Date(f.lastModified) });
	}
	return out;
}

function ensureLocalDir(key: string): void {
	const dir = path.dirname(key);
	if (dir && dir !== '.' && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}
