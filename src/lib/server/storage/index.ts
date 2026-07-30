import type { StorageBackend } from './types';
import { loadStorageConfig, type StorageConfig } from './config';
import { LocalBackend } from './local';
import { S3Backend } from './s3';
import { AzureBackend } from './azure';

export type { StorageBackend, StorageEntry, StatResult, WriteOptions } from './types';
export type { StorageConfig } from './config';
export { loadStorageConfig } from './config';

export function createStorage(cfg: StorageConfig): StorageBackend {
	switch (cfg.backend) {
		case 'local':
			return new LocalBackend(cfg);
		case 's3':
			return new S3Backend(cfg);
		case 'azure':
			return new AzureBackend(cfg);
	}
}

let singleton: StorageBackend | undefined;

export function storage(): StorageBackend {
	if (!singleton) singleton = createStorage(loadStorageConfig());
	return singleton;
}
