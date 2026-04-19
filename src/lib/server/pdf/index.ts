/**
 * Public entry for PDF rendering. Owns:
 *
 *   - Puppeteer browser singleton + per-request page lifecycle
 *   - LRU cache keyed by content hash
 *   - Dispatch to a template module (default: 'argos')
 *   - TOC page-number patching after layout
 *   - Footer injection via CSS paged media @bottom margin boxes
 *
 * Callers pass `CommonMeta` (cross-template fields) + `options` (a
 * template-specific sub-map from frontmatter). Each template narrows its
 * options internally.
 */

import puppeteer, { type Browser } from 'puppeteer';
import { createHash } from 'node:crypto';
import { readBranding } from '$lib/branding';
import { brandingVersion, getCoverVisual, inlineAttachments } from './shared';
import {
	DEFAULT_TEMPLATE_ID,
	getTemplate,
	type CommonMeta,
	type TocEntry
} from './templates';

export type { CommonMeta, TocEntry } from './templates';
export { listTemplates } from './templates';

// ── Debug logging ────────────────────────────────────────────────────────

const DEBUG = process.env.DEBUG === 'true';
function log(msg: string) {
	if (DEBUG) console.log(`[pdf] ${new Date().toISOString()} ${msg}`);
}

// ── Browser lifecycle ────────────────────────────────────────────────────

const A4_CONTENT_HEIGHT_PX = 930;

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
	if (_browser && _browser.connected) {
		log('reusing existing browser instance');
		return _browser;
	}
	log('launching new browser instance...');
	const t = Date.now();
	_browser = await puppeteer.launch({
		headless: 'shell',
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
	});
	log(`browser ready in ${Date.now() - t}ms`);
	_browser.on('disconnected', () => {
		log('browser disconnected — will relaunch on next request');
		_browser = null;
	});
	return _browser;
}

// ── LRU cache ────────────────────────────────────────────────────────────
// One entry per doc-hash → rendered PDF buffer. Preview and download share
// the same cached output; only the HTTP `Content-Disposition` differs.

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, Buffer>();

function cacheKey(
	templateId: string,
	meta: CommonMeta,
	options: Record<string, unknown>,
	bodyHtml: string,
	toc: TocEntry[],
	wsId: string
): string {
	const h = createHash('sha256');
	h.update(templateId);
	h.update('|');
	h.update(wsId);
	h.update('|');
	h.update(brandingVersion(readBranding()));
	h.update('|');
	h.update(JSON.stringify(meta));
	h.update('|');
	h.update(JSON.stringify(options));
	h.update('|');
	h.update(JSON.stringify(toc));
	h.update('|');
	h.update(bodyHtml);
	return h.digest('hex');
}

function cacheGet(key: string): Buffer | null {
	const hit = cache.get(key);
	if (!hit) return null;
	// LRU refresh — delete+set moves to the newest position.
	cache.delete(key);
	cache.set(key, hit);
	return hit;
}

function cacheSet(key: string, pdf: Buffer): void {
	if (cache.size >= MAX_CACHE_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	cache.set(key, pdf);
}

// ── Public API ───────────────────────────────────────────────────────────

export interface RenderOptions {
	/** Template id. Defaults to 'formal'. */
	templateId?: string;
}

export interface RenderResult {
	pdf: Buffer;
	/** Whether this result came from the cache. */
	cached: boolean;
}

/**
 * Render a PDF from the given markdown-derived HTML. Results are cached by
 * content hash; repeat renders of the same doc are near-instant. Callers
 * that want a preview instead of a download flip `Content-Disposition` on
 * the HTTP response — the bytes are the same.
 */
export async function renderPdf(
	meta: CommonMeta,
	options: Record<string, unknown>,
	bodyHtml: string,
	toc: TocEntry[],
	wsId: string,
	opts: RenderOptions = {}
): Promise<RenderResult> {
	const templateId = opts.templateId ?? DEFAULT_TEMPLATE_ID;
	const template = getTemplate(templateId);
	log(`render: "${meta.title}" template=${templateId}`);

	const key = cacheKey(templateId, meta, options, bodyHtml, toc, wsId);
	const cached = cacheGet(key);
	if (cached) {
		log('cache HIT');
		return { pdf: cached, cached: true };
	}

	const branding = readBranding();
	// Cover visual is driven by argos's `cover` / `coverImage`. Other templates
	// ignore `coverVisual` in ctx — this stays here because the argos path is
	// the most common and we want to keep the legacy flat-key contract.
	const coverStyle = typeof options.cover === 'string' || typeof options.cover === 'boolean'
		? options.cover
		: undefined;
	const coverImage = typeof options.coverImage === 'string' ? options.coverImage : undefined;
	const coverVisual = await getCoverVisual({
		style: coverStyle,
		image: coverImage,
		seed: meta.title
	});

	const inlinedBody = await inlineAttachments(wsId, bodyHtml);
	const ctx = {
		meta,
		options,
		bodyHtml: inlinedBody,
		toc,
		branding,
		coverVisual
	};
	const html = await template.buildFull(ctx);
	const hasToc = toc.length > 2;

	// Templates know how many pre-textual pages they emit. Fall back to the
	// argos convention when they don't report.
	const preTextual = template.preTextualPages?.(ctx) ?? (hasToc ? 2 : 1);

	const pdf = await renderPuppeteer(html, {
		patchToc: hasToc,
		contentStartPage: preTextual + 1
	});

	cacheSet(key, pdf);
	return { pdf, cached: false };
}

// ── Puppeteer rendering ──────────────────────────────────────────────────

interface PuppeteerRenderOpts {
	patchToc: boolean;
	contentStartPage?: number;
}

async function renderPuppeteer(html: string, opts: PuppeteerRenderOpts): Promise<Buffer> {
	const browser = await getBrowser();
	const t0 = Date.now();
	const page = await browser.newPage();
	const tmpPath = `/tmp/pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`;

	try {
		await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

		log('loading HTML...');
		const t1 = Date.now();
		await Bun.write(tmpPath, html);
		await page.goto(`file://${tmpPath}`, { waitUntil: 'load', timeout: 60000 });
		await page.waitForFunction(() => (window as unknown as { __mermaidDone?: boolean }).__mermaidDone === true, { timeout: 30000 });
		log(`loaded in ${Date.now() - t1}ms`);

		if (opts.patchToc && opts.contentStartPage !== undefined) {
			// Each academic template anchors its body in a different root
			// class — we check the known ones in priority order. Templates
			// that want TOC patching just need a root element matching one
			// of these selectors.
			const patched = await page.evaluate(
				(pageH: number, startPage: number) => {
					const content = document.querySelector(
						'.doc-content, .abnt-body, .paper-body'
					) as HTMLElement | null;
					if (!content) return 0;
					const contentTop = content.getBoundingClientRect().top + window.scrollY;
					let count = 0;
					document.querySelectorAll('[data-toc-id]').forEach((entry) => {
						const id = entry.getAttribute('data-toc-id')!;
						const heading = document.getElementById(id);
						if (!heading) return;
						const top = heading.getBoundingClientRect().top + window.scrollY;
						const pageNum = startPage + Math.floor((top - contentTop) / pageH);
						const pgEl = entry.querySelector('.toc-pg');
						if (pgEl) { pgEl.textContent = String(pageNum); count++; }
					});
					return count;
				},
				A4_CONTENT_HEIGHT_PX,
				opts.contentStartPage
			);
			log(`TOC patched: ${patched} entries`);
		}

		// No global footer injection — each template owns its own page
		// number placement via @page margin boxes inside its CSS. Argos
		// paints the author's footer + counter at the bottom; ABNT puts
		// the counter at the top-right per NBR 14724; ACM/IEEE render the
		// counter centered at the bottom per their respective conventions.

		log('generating PDF bytes...');
		const t3 = Date.now();
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			displayHeaderFooter: false
		});
		log(`PDF generated in ${Date.now() - t3}ms — ${(pdf.byteLength / 1024).toFixed(1)} KB`);
		log(`total render time: ${Date.now() - t0}ms`);
		return Buffer.from(pdf);
	} finally {
		await page.close();
		log('page closed');
		Bun.file(tmpPath).exists().then((exists) => {
			if (exists) Bun.spawn(['rm', '-f', tmpPath]);
		});
	}
}
