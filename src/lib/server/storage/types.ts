export interface StorageEntry {
	key: string;
	size: number;
	lastModified: Date;
}

export interface StatResult {
	size: number;
	lastModified: Date;
	contentType?: string;
}

export interface WriteOptions {
	contentType?: string;
}

export interface StorageBackend {
	readonly name: string;

	readText(key: string): Promise<string>;
	readBinary(key: string): Promise<Uint8Array>;
	tryReadText(key: string): Promise<string | null>;
	tryReadBinary(key: string): Promise<Uint8Array | null>;

	write(key: string, data: string | Uint8Array, opts?: WriteOptions): Promise<void>;
	remove(key: string): Promise<void>;

	exists(key: string): Promise<boolean>;
	stat(key: string): Promise<StatResult | null>;

	list(prefix: string): Promise<StorageEntry[]>;
}
