import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// Server-only packages that use Node/native APIs (a native N-API addon, the AWS
// and Azure SDKs). They must not be pre-bundled by the dep optimizer or pulled
// into the browser graph — keep them external to SSR so Node loads them directly.
const serverOnly = [
	'@myriaddreamin/typst-ts-node-compiler',
	'isomorphic-git',
	'@aws-sdk/client-s3',
	'@azure/storage-blob',
	'postgres',
	'drizzle-orm',
	'shiki',
	'@shikijs/markdown-it',
	'markdown-it',
	'gray-matter',
	'@modelcontextprotocol/sdk'
];

export default defineConfig(({ mode }) => {
	// Expose all .env vars (not just VITE_*) to server code via process.env, so
	// $lib/server modules read config the same way here as in scripts and prod.
	Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				adapter: adapter(),

				typescript: {
					config: (config) => {
						config.include.push('../drizzle.config.ts');
					}
				}
			}),

			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				emitTsDeclarations: true,
				// Locale from a cookie the user can set, else the browser's Accept-Language,
				// else the base locale. No URL prefixes — routes stay clean.
				strategy: ['cookie', 'preferredLanguage', 'baseLocale']
			})
		],
		optimizeDeps: { exclude: serverOnly },
		ssr: { external: serverOnly }
	};
});
