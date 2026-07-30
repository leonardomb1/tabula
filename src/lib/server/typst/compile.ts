import * as path from 'node:path';
import { compiler, workspaceRoot } from './compiler';
import type { NodeCompiler, NodeTypstCompileResult } from '@myriaddreamin/typst-ts-node-compiler';

export type Assets = Record<string, Uint8Array>;

export interface CompileOptions {
	inputs?: Record<string, string>;
	assets?: Assets;
}

export interface SvgResult {
	svg: string;
	pages: number;
}

export const RENDER_TAG = 'svg-css-px@2';

const PT_TO_PX = 96 / 72;

function toCssPixels(svg: string): string {
	const end = svg.indexOf('>');
	if (!svg.startsWith('<svg') || end < 0) return svg;

	const head = svg
		.slice(0, end)
		.replace(/\swidth="([\d.]+)"/, (_m, v: string) => ` width="${(Number(v) * PT_TO_PX).toFixed(3)}"`)
		.replace(
			/\sheight="([\d.]+)"/,
			(_m, v: string) => ` height="${(Number(v) * PT_TO_PX).toFixed(3)}"`
		);

	return head + svg.slice(end);
}

export class TypstCompileError extends Error {
	readonly diagnostics: unknown[];
	constructor(message: string, diagnostics: unknown[]) {
		super(message);
		this.name = 'TypstCompileError';
		this.diagnostics = diagnostics;
	}
}

function applyAssets(c: NodeCompiler, assets?: Assets) {
	if (!assets) return;
	const root = workspaceRoot();
	for (const [key, bytes] of Object.entries(assets)) {
		const rel = key.replace(/^\/+/, '');
		c.mapShadow(path.join(root, rel), Buffer.from(bytes));
	}
}

function assertOk(res: NodeTypstCompileResult): void {
	if (res.hasError()) {
		const err = res.takeError();
		const diags = (err?.shortDiagnostics as unknown[]) ?? [];
		throw new TypstCompileError('typst: compilation failed', diags);
	}
}

export async function compilePdf(source: string, opts: CompileOptions = {}): Promise<Uint8Array> {
	const c = compiler();
	try {
		applyAssets(c, opts.assets);
		const res = c.compile({ mainFileContent: source, inputs: opts.inputs });
		assertOk(res);
		const pdf = c.pdf(res.result!, { pdfTags: true });
		return new Uint8Array(pdf);
	} finally {
		c.resetShadow();
	}
}

export async function compileSvg(source: string, opts: CompileOptions = {}): Promise<SvgResult> {
	const c = compiler();
	try {
		applyAssets(c, opts.assets);
		const res = c.compile({ mainFileContent: source, inputs: opts.inputs });
		assertOk(res);
		const doc = res.result!;
		return { svg: toCssPixels(c.svg(doc)), pages: doc.numOfPages };
	} finally {
		c.resetShadow();
	}
}

export async function compileSnippetSvg(snippet: string, opts: CompileOptions = {}): Promise<string> {
	const wrapped = `#set page(width: auto, height: auto, margin: 6pt)\n#set text(size: 12pt)\n${snippet}`;
	return (await compileSvg(wrapped, opts)).svg;
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

export async function extractText(source: string, opts: CompileOptions = {}): Promise<string> {
	const c = compiler();
	try {
		applyAssets(c, opts.assets);
		const html = c.tryHtml({ mainFileContent: source, inputs: opts.inputs });
		if (!html.hasError() && html.result) {
			const text = stripHtml(html.result.body());
			if (text) return text;
		}
		const paged = c.compile({ mainFileContent: source, inputs: opts.inputs });
		if (!paged.hasError() && paged.result) {
			const runs = c.query(paged.result, { selector: 'text', field: 'text' });
			if (Array.isArray(runs)) return runs.join(' ').replace(/\s+/g, ' ').trim();
		}
		return '';
	} catch {
		return '';
	} finally {
		c.resetShadow();
	}
}
