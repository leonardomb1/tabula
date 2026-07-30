import {
	S3Client,
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command
} from '@aws-sdk/client-s3';
import type { StorageBackend, StorageEntry, StatResult, WriteOptions } from './types';
import { contentTypeFor } from './mime';

export interface S3Config {
	bucket: string;
	region: string;
	endpoint?: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle?: boolean;
	prefix?: string;
}

function isNotFound(err: unknown): boolean {
	const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
	return e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}

export class S3Backend implements StorageBackend {
	readonly name = 's3';
	private readonly client: S3Client;
	private readonly bucket: string;
	private readonly prefix: string;

	constructor(cfg: S3Config) {
		this.bucket = cfg.bucket;
		this.prefix = cfg.prefix ? cfg.prefix.replace(/\/+$/, '') + '/' : '';
		this.client = new S3Client({
			region: cfg.region,
			endpoint: cfg.endpoint,
			forcePathStyle: cfg.forcePathStyle ?? Boolean(cfg.endpoint),
			credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
		});
	}

	private objectKey(key: string): string {
		return this.prefix + key;
	}

	private stripPrefix(objectKey: string): string {
		return this.prefix && objectKey.startsWith(this.prefix)
			? objectKey.slice(this.prefix.length)
			: objectKey;
	}

	async readBinary(key: string): Promise<Uint8Array> {
		const res = await this.client.send(
			new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })
		);
		return res.Body!.transformToByteArray();
	}

	async readText(key: string): Promise<string> {
		const res = await this.client.send(
			new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })
		);
		return res.Body!.transformToString('utf-8');
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
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: this.objectKey(key),
				Body: typeof data === 'string' ? Buffer.from(data, 'utf8') : data,
				ContentType: opts?.contentType ?? contentTypeFor(key)
			})
		);
	}

	async remove(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })
		);
	}

	async exists(key: string): Promise<boolean> {
		return (await this.stat(key)) !== null;
	}

	async stat(key: string): Promise<StatResult | null> {
		try {
			const res = await this.client.send(
				new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) })
			);
			return {
				size: res.ContentLength ?? 0,
				lastModified: res.LastModified ?? new Date(0),
				contentType: res.ContentType ?? contentTypeFor(key)
			};
		} catch (err) {
			if (isNotFound(err)) return null;
			throw err;
		}
	}

	async list(prefix: string): Promise<StorageEntry[]> {
		const out: StorageEntry[] = [];
		let ContinuationToken: string | undefined;
		do {
			const res = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: this.objectKey(prefix),
					ContinuationToken
				})
			);
			for (const obj of res.Contents ?? []) {
				if (!obj.Key) continue;
				out.push({
					key: this.stripPrefix(obj.Key),
					size: obj.Size ?? 0,
					lastModified: obj.LastModified ?? new Date(0)
				});
			}
			ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
		} while (ContinuationToken);
		return out;
	}
}
