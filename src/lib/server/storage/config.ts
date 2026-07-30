import type { LocalConfig } from './local';
import type { S3Config } from './s3';
import type { AzureConfig } from './azure';

export type StorageConfig =
	| ({ backend: 'local' } & LocalConfig)
	| ({ backend: 's3' } & S3Config)
	| ({ backend: 'azure' } & AzureConfig);

function required(env: NodeJS.ProcessEnv, key: string): string {
	const v = env[key];
	if (!v) throw new Error(`storage: missing required env ${key}`);
	return v;
}

export function loadStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
	const backend = (env.STORAGE ?? 'local').toLowerCase();

	switch (backend) {
		case 'local':
			return { backend: 'local', root: env.STORAGE_LOCAL_PATH ?? './content' };

		case 's3':
			return {
				backend: 's3',
				bucket: required(env, 'S3_BUCKET'),
				region: env.S3_REGION ?? 'auto',
				endpoint: env.S3_ENDPOINT || undefined,
				accessKeyId: required(env, 'S3_ACCESS_KEY_ID'),
				secretAccessKey: required(env, 'S3_SECRET_ACCESS_KEY'),
				forcePathStyle: env.S3_FORCE_PATH_STYLE
					? env.S3_FORCE_PATH_STYLE === 'true'
					: undefined,
				prefix: env.S3_PREFIX || undefined
			};

		case 'azure':
			return {
				backend: 'azure',
				container: required(env, 'AZURE_STORAGE_CONTAINER'),
				connectionString: env.AZURE_STORAGE_CONNECTION_STRING || undefined,
				accountName: env.AZURE_STORAGE_ACCOUNT || undefined,
				accountKey: env.AZURE_STORAGE_KEY || undefined,
				endpoint: env.AZURE_STORAGE_ENDPOINT || undefined,
				prefix: env.AZURE_STORAGE_PREFIX || undefined
			};

		default:
			throw new Error(`storage: unknown STORAGE backend '${backend}' (expected local|s3|azure)`);
	}
}
