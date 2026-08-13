import { mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { NodeCompiler, type CompileArgs } from '@myriaddreamin/typst-ts-node-compiler';

let instance: NodeCompiler | null = null;
let workspace: string | null = null;

export function workspaceRoot(): string {
	if (!workspace) {
		workspace = process.env.TYPST_WORKSPACE || path.join(os.tmpdir(), 'tabula-typst-root');
		mkdirSync(workspace, { recursive: true });
	}
	return workspace;
}

function buildArgs(): CompileArgs {
	const fontPaths = (process.env.TYPST_FONTS_PATH || '')
		.split(path.delimiter)
		.map((p) => p.trim())
		.filter(Boolean);

	return {
		workspace: workspaceRoot(),
		fontArgs: fontPaths.length ? [{ fontPaths }] : undefined
	};
}

export function compiler(): NodeCompiler {
	if (!instance) instance = NodeCompiler.create(buildArgs());
	return instance;
}

export const ENGINE_TAG = 'typst-ts-node@0.7.0';
