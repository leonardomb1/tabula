import {
	BlobServiceClient,
	StorageSharedKeyCredential,
	type ContainerClient,
	RestError
} from '@azure/storage-blob';
import type { StorageBackend, StorageEntry, StatResult, WriteOptions } from './types';
import { contentTypeFor } from './mime';

export interface AzureConfig {
	container: string;
	prefix?: string;
	connectionString?: string;
	accountName?: string;
	accountKey?: string;
	endpoint?: string;
}

function isNotFound(err: unknown): boolean {
	return err instanceof RestError && err.statusCode === 404;
}

function buildService(cfg: AzureConfig): BlobServiceClient {
	if (cfg.connectionString) {
		return BlobServiceClient.fromConnectionString(cfg.connectionString);
	}
	if (cfg.accountName && cfg.accountKey) {
		const url = cfg.endpoint ?? `https://${cfg.accountName}.blob.core.windows.net`;
		const cred = new StorageSharedKeyCredential(cfg.accountName, cfg.accountKey);
		return new BlobServiceClient(url, cred);
	}
	throw new Error(
		'storage(azure): provide either connectionString, or accountName + accountKey'
	);
}

export class AzureBackend implements StorageBackend {
	readonly name = 'azure';
	private readonly container: ContainerClient;
	private readonly prefix: string;

	constructor(cfg: AzureConfig) {
		this.prefix = cfg.prefix ? cfg.prefix.replace(/\/+$/, '') + '/' : '';
		this.container = buildService(cfg).getContainerClient(cfg.container);
	}

	private blobName(key: string): string {
		return this.prefix + key;
	}

	private stripPrefix(name: string): string {
		return this.prefix && name.startsWith(this.prefix) ? name.slice(this.prefix.length) : name;
	}

	async readBinary(key: string): Promise<Uint8Array> {
		const buf = await this.container.getBlockBlobClient(this.blobName(key)).downloadToBuffer();
		return new Uint8Array(buf);
	}

	async readText(key: string): Promise<string> {
		const buf = await this.container.getBlockBlobClient(this.blobName(key)).downloadToBuffer();
		return buf.toString('utf8');
	}

	async tryReadBinary(key: string): Promise<Uint8Array | null> {
		try {
			return await this.readBinary(key);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async tryReadText(key: string): Promise<string | null> {
		try {
			return await this.readText(key);
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async write(key: string, data: string | Uint8Array, opts?: WriteOptions): Promise<void> {
		const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
		await this.container.getBlockBlobClient(this.blobName(key)).uploadData(body, {
			blobHTTPHeaders: { blobContentType: opts?.contentType ?? contentTypeFor(key) }
		});
	}

	async remove(key: string): Promise<void> {
		await this.container.getBlockBlobClient(this.blobName(key)).deleteIfExists();
	}

	async exists(key: string): Promise<boolean> {
		return this.container.getBlockBlobClient(this.blobName(key)).exists();
	}

	async stat(key: string): Promise<StatResult | null> {
		try {
			const p = await this.container.getBlockBlobClient(this.blobName(key)).getProperties();
			return {
				size: p.contentLength ?? 0,
				lastModified: p.lastModified ?? new Date(0),
				contentType: p.contentType ?? contentTypeFor(key)
			};
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async list(prefix: string): Promise<StorageEntry[]> {
		const out: StorageEntry[] = [];
		for await (const blob of this.container.listBlobsFlat({ prefix: this.blobName(prefix) })) {
			out.push({
				key: this.stripPrefix(blob.name),
				size: blob.properties.contentLength ?? 0,
				lastModified: blob.properties.lastModified ?? new Date(0)
			});
		}
		return out;
	}
}
