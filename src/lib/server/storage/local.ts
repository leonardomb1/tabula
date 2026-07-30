import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StorageBackend, StorageEntry, StatResult, WriteOptions } from './types';
import { contentTypeFor } from './mime';

export interface LocalConfig {
	root: string;
}

function isNotFound(err: unknown): boolean {
	return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

export class LocalBackend implements StorageBackend {
	readonly name = 'local';
	private readonly root: string;

	constructor(cfg: LocalConfig) {
		this.root = path.resolve(cfg.root);
	}

	private resolve(key: string): string {
		const full = path.resolve(this.root, key);
		const rel = path.relative(this.root, full);
		if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
			throw new Error(`storage: key escapes root: ${key}`);
		}
		return full;
	}

	async readText(key: string): Promise<string> {
		return fs.readFile(this.resolve(key), 'utf8');
	}

	async readBinary(key: string): Promise<Uint8Array> {
		return new Uint8Array(await fs.readFile(this.resolve(key)));
	}

	async tryReadText(key: string): Promise<string | null> {
		try {
			return await this.readText(key);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async tryReadBinary(key: string): Promise<Uint8Array | null> {
		try {
			return await this.readBinary(key);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async write(key: string, data: string | Uint8Array, _opts?: WriteOptions): Promise<void> {
		const full = this.resolve(key);
		await fs.mkdir(path.dirname(full), { recursive: true });
		await fs.writeFile(full, data);
	}

	async remove(key: string): Promise<void> {
		try {
			await fs.unlink(this.resolve(key));
		} catch (err) {
			if (!isNotFound(err)) throw err;
		}
	}

	async exists(key: string): Promise<boolean> {
		return (await this.stat(key)) !== null;
	}

	async stat(key: string): Promise<StatResult | null> {
		try {
			const s = await fs.stat(this.resolve(key));
			if (!s.isFile()) return null;
			return { size: s.size, lastModified: s.mtime, contentType: contentTypeFor(key) };
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async list(prefix: string): Promise<StorageEntry[]> {
		const out: StorageEntry[] = [];
		const walk = async (dir: string): Promise<void> => {
			let entries: import('node:fs').Dirent[];
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch (err) {
				if (isNotFound(err)) return;
				throw err;
			}
			for (const e of entries) {
				const abs = path.join(dir, e.name);
				if (e.isDirectory()) {
					await walk(abs);
				} else if (e.isFile()) {
					const key = path.relative(this.root, abs).split(path.sep).join('/');
					if (key.startsWith(prefix)) {
						const s = await fs.stat(abs);
						out.push({ key, size: s.size, lastModified: s.mtime });
					}
				}
			}
		};
		await walk(this.root);
		return out;
	}
}
