import { createHash } from 'node:crypto';
import { storage } from '../storage';
import { ENGINE_TAG } from './compiler';
import {
	compilePdf,
	compileSnippetSvg,
	compileSvg,
	RENDER_TAG,
	type CompileOptions,
	type SvgResult
} from './compile';

const PREFIX = 'cache/typst';

function cacheKey(kind: string, source: string, opts: CompileOptions): string {
	const h = createHash('sha256');
	h.update(ENGINE_TAG);
	h.update('\0' + RENDER_TAG);
	h.update('\0' + kind);
	h.update('\0' + JSON.stringify(opts.inputs ?? {}));
	if (opts.assets) {
		for (const name of Object.keys(opts.assets).sort()) {
			h.update('\0asset:' + name + '\0');
			h.update(opts.assets[name]);
		}
	}
	h.update('\0' + source);
	return h.digest('hex');
}

/**
 * Compiles to PDF and returns the bytes with the storage key they were cached
 * under. The key is content-addressed, so a signed link to it can be handed out
 * without storing anything extra.
 */
export async function getOrCompilePdfKeyed(
	source: string,
	opts: CompileOptions = {}
): Promise<{ pdf: Uint8Array; key: string }> {
	const key = `${PREFIX}/${cacheKey('pdf', source, opts)}.pdf`;
	const hit = await storage().tryReadBinary(key);
	if (hit) return { pdf: hit, key };
	const pdf = await compilePdf(source, opts);
	await storage().write(key, pdf, { contentType: 'application/pdf' });
	return { pdf, key };
}

export async function getOrCompilePdf(source: string, opts: CompileOptions = {}): Promise<Uint8Array> {
	return (await getOrCompilePdfKeyed(source, opts)).pdf;
}

/** True for keys this module owns, so a signed link cannot address the whole bucket. */
export function isPdfCacheKey(key: string): boolean {
	return /^cache\/typst\/[0-9a-f]{64}\.pdf$/.test(key);
}

export function snippetId(snippet: string): string {
	return createHash('sha256')
		.update(ENGINE_TAG)
		.update('\0' + RENDER_TAG)
		.update('\0snippet\0')
		.update(snippet)
		.digest('hex');
}

export function snippetStorageKey(id: string): string {
	return `cache/typst-snippet/${id}.svg`;
}

export async function getOrCompileSnippetSvg(snippet: string): Promise<{ id: string; svg: string }> {
	const id = snippetId(snippet);
	const key = snippetStorageKey(id);
	const hit = await storage().tryReadText(key);
	if (hit !== null) return { id, svg: hit };
	const svg = await compileSnippetSvg(snippet);
	await storage().write(key, svg, { contentType: 'image/svg+xml' });
	return { id, svg };
}

export async function getOrCompileSvg(source: string, opts: CompileOptions = {}): Promise<SvgResult> {
	const base = `${PREFIX}/${cacheKey('svg', source, opts)}`;
	const [svg, pagesRaw] = await Promise.all([
		storage().tryReadText(`${base}.svg`),
		storage().tryReadText(`${base}.pages`)
	]);
	if (svg !== null && pagesRaw !== null) {
		return { svg, pages: Number(pagesRaw) || 1 };
	}
	const result = await compileSvg(source, opts);
	await Promise.all([
		storage().write(`${base}.svg`, result.svg, { contentType: 'image/svg+xml' }),
		storage().write(`${base}.pages`, String(result.pages))
	]);
	return result;
}
