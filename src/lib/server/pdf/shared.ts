/**
 * Shared helpers used by every PDF template.
 *
 * Contents:
 *   - Font CSS inlined at build time (Inter woff2, KaTeX CSS)
 *   - Brand palette derivation (hex ⇄ HSL)
 *   - Branding logo + cover image readers (memoized)
 *   - Cover visual generators (memoized by seed+style)
 *   - Attachment inlining (parallel)
 *   - Asset-presence detectors used for conditional script/CSS injection
 *
 * Templates import from here; nothing here imports templates.
 */

import katexCssRaw from 'katex/dist/katex.min.css?raw';
import { readFileSync } from 'node:fs';
import { readBranding, type Branding } from '$lib/branding';

// ── Fonts ─────────────────────────────────────────────────────────────────

function interFace(weight: number): string {
	try {
		const buf = readFileSync(`node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`);
		return `@font-face{font-family:'Inter';font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`;
	} catch {
		return '';
	}
}

export const INTER_CSS = [300, 400, 500, 600, 700].map(interFace).join('');

/**
 * Inline a fontsource family as base64 @font-face rules. Used by the
 * academic templates that need a specific display face (Libertinus for
 * ACM). Puppeteer loads HTML via file:// so we can't rely on CSS imports
 * resolving to node_modules; inlining keeps the font deterministic and
 * offline-safe.
 *
 * @param family    CSS family name to expose (e.g. "Libertinus Serif")
 * @param pathBase  Path stub under node_modules up to the weight/style
 *                  suffix — e.g. `@fontsource/libertinus-serif/files/libertinus-serif-latin`
 * @param variants  Tuples of [weight, style] to inline
 */
export function inlineFontFamily(
	family: string,
	pathBase: string,
	variants: Array<[number, 'normal' | 'italic']>
): string {
	return variants
		.map(([weight, style]) => {
			try {
				const buf = readFileSync(`node_modules/${pathBase}-${weight}-${style}.woff2`);
				return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:swap;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`;
			} catch {
				return '';
			}
		})
		.join('');
}

export const KATEX_CSS = katexCssRaw.replace(
	/url\(fonts\//g,
	'url(https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/fonts/'
);

// ── Conditional-injection detectors ───────────────────────────────────────
// Templates pass `bodyHtml` through these to decide whether to ship mermaid
// (~200 KB JS) or KaTeX CSS (~50 KB). Most docs need neither.

export function needsMermaid(bodyHtml: string): boolean {
	return bodyHtml.includes('class="mermaid"');
}

export function needsKatex(bodyHtml: string): boolean {
	return bodyHtml.includes('class="katex');
}

// ── Brand palette ─────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
	const m = hex.replace('#', '');
	const r = parseInt(m.slice(0, 2), 16) / 255;
	const g = parseInt(m.slice(2, 4), 16) / 255;
	const b = parseInt(m.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0, s = 0;
	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
			case g: h = ((b - r) / d + 2); break;
			case b: h = ((r - g) / d + 4); break;
		}
		h *= 60;
	}
	return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
		return Math.round(c * 255).toString(16).padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

export function brandPalette(base: string, count: number, minL = 0.15): string[] {
	const [h, s, l] = hexToHsl(base);
	const low = Math.min(l, minL);
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const t = count === 1 ? 0 : i / (count - 1);
		out.push(hslToHex(h, s, l - t * (l - low)));
	}
	return out;
}

export function brandRgba(base: string, alpha: number): string {
	const m = base.replace('#', '');
	return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${alpha})`;
}

// ── Branding logo (memoized) ──────────────────────────────────────────────
// Storage reads are slow relative to the rest of render time. A filename →
// data-URL cache with 60s TTL absorbs repeat reads for the same render batch
// without pinning stale data indefinitely.

const LOGO_TTL_MS = 60_000;
const logoCache = new Map<string, { url: string | null; at: number }>();

async function readBrandingSvgDataUrl(file: string): Promise<string | null> {
	const hit = logoCache.get(file);
	if (hit && Date.now() - hit.at < LOGO_TTL_MS) return hit.url;

	const { getBinary } = await import('../storage');
	const { prefixes } = await import('../docsIndex');
	const buf = await getBinary(`${prefixes.branding}${file}`);
	const url = buf ? `data:image/svg+xml;base64,${Buffer.from(buf).toString('base64')}` : null;
	logoCache.set(file, { url, at: Date.now() });
	return url;
}

/**
 * Logo HTML for PDF covers. Templates with a dark header (argos) pass
 * `negative: true` — we then prefer `logo_negative.svg` (the inverted
 * white variant), fall through to the positive logo, then to text.
 *
 * Filename matches the web-side convention (src/lib/BrandLogo.svelte)
 * so maintainers only upload one file to cover both surfaces.
 */
export async function getBrandLogoHtml(name: string, color: string, negative = false): Promise<string> {
	const url =
		(await readBrandingSvgDataUrl(negative ? 'logo_negative.svg' : 'logo.svg')) ??
		(negative ? await readBrandingSvgDataUrl('logo.svg') : null);

	if (url) {
		return `<img src="${url}" alt="${name}" style="height:36px;width:auto;display:block"/>`;
	}
	const textColor = negative ? '#ffffff' : color;
	return `<span style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:20pt;color:${textColor};">${name}</span>`;
}

// ── Cover visuals ─────────────────────────────────────────────────────────

export type CoverStyle = 'lowpoly' | 'diamond' | 'geo' | 'mesh' | 'image' | 'none';

export interface CoverSpec {
	style?: CoverStyle | string | boolean;
	/** Filename from content/covers/ when style === 'image' */
	image?: string;
	/** Seed for deterministic pattern generation (typically the doc title) */
	seed: string;
}

async function getCoverImageDataUrl(filename?: string): Promise<string | null> {
	if (!filename) return null;
	const { getBinary } = await import('../storage');
	const { prefixes } = await import('../docsIndex');
	const buf = await getBinary(`${prefixes.covers}${filename}`);
	if (!buf) return null;
	const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
	const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
	return `data:${mime};base64,${Buffer.from(buf).toString('base64')}`;
}

/** FNV-1a hash → deterministic seed per document title */
function titleHash(title: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < title.length; i++) h = Math.imul(h ^ title.charCodeAt(i), 0x01000193);
	return h >>> 0;
}

/** Mulberry32 PRNG */
function seededRand(seed: number) {
	let s = seed | 0;
	return () => { s = Math.imul(s ^ (s >>> 15), s | 1); s ^= s + Math.imul(s ^ (s >>> 7), s | 61); return ((s ^ (s >>> 14)) >>> 0) / 0x100000000; };
}

function svgWrap(W: number, H: number, content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%">${content}</svg>`;
}

/** Dark low-poly triangulation — default dark pattern with brand accents */
function buildLowPolyPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 180, cols = 9, rows = 5;
	const cw = W / (cols - 1), ch = H / (rows - 1);
	const pts: [number, number][] = [];
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
			pts.push([Math.max(0, Math.min(W, c * cw + (edge ? 0 : (rand() - 0.5) * 18))), Math.max(0, Math.min(H, r * ch + (edge ? 0 : (rand() - 0.5) * 14)))]);
		}
	const darks = ['#0a0a0a', '#0f0f0f', '#141414', '#191919', '#1e1e1e', '#232323', '#282828', '#2e2e2e', '#333', '#393939'];
	const reds = brandPalette(readBranding().color, 6);
	const f = (n: number) => n.toFixed(1);
	const polys: string[] = [`<rect width="${W}" height="${H}" fill="#0a0a0a"/>`];
	let ti = 0;
	for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
		const [tl, tr, bl, br] = [pts[r * cols + c], pts[r * cols + c + 1], pts[(r + 1) * cols + c], pts[(r + 1) * cols + c + 1]];
		const col = (cx: number, i: number) => { const h = ((i * 2654435761) >>> 0) % 10000; return (h < 1300 && cx / W > 0.15 && cx / W < 0.88) ? reds[h % reds.length] : darks[(h % darks.length + Math.floor(cx / W * 3)) % darks.length]; };
		polys.push(`<polygon points="${f(tl[0])},${f(tl[1])} ${f(tr[0])},${f(tr[1])} ${f(bl[0])},${f(bl[1])}" fill="${col((tl[0] + tr[0] + bl[0]) / 3, ti++)}"/>`);
		polys.push(`<polygon points="${f(tr[0])},${f(tr[1])} ${f(bl[0])},${f(bl[1])} ${f(br[0])},${f(br[1])}" fill="${col((tr[0] + bl[0] + br[0]) / 3, ti++)}"/>`);
	}
	return svgWrap(W, H, polys.join(''));
}

/** Crystalline diamond grid — brand-derived shades on white */
function buildDiamondPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 200;
	const brand = readBranding().color;
	const reds = brandPalette(brand, 8);
	const darks = ['#1a1a1a', '#242424', '#2e2e2e', '#383838'];
	const lights = [brandRgba(brand, 0.18), brandRgba(brand, 0.12), 'rgba(26,26,26,0.10)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.5)'];
	const dw = 30, dh = 19;
	const shapes: string[] = ['<rect width="600" height="200" fill="#fff"/>'];
	const cols = Math.ceil(W / dw) + 3, rows = Math.ceil(H / dh) + 3;
	const f = (n: number) => n.toFixed(1);
	for (let r = -1; r < rows; r++) for (let c = -1; c < cols; c++) {
		const cx = c * dw + (r % 2 ? dw / 2 : 0), cy = r * dh;
		const sw = dw * (0.72 + rand() * 0.5), sh = dh * (0.72 + rand() * 0.5);
		const rv = rand();
		const fill = rv < 0.20 ? reds[Math.floor(rand() * reds.length)] : rv < 0.30 ? darks[Math.floor(rand() * darks.length)] : lights[Math.floor(rand() * lights.length)];
		const fill2 = rv < 0.20 ? reds[(Math.floor(rand() * reds.length) + 3) % reds.length] : fill;
		const op = (0.35 + rand() * 0.65).toFixed(2);
		const op2 = Math.min(1, parseFloat(op) * (0.65 + rand() * 0.5)).toFixed(2);
		shapes.push(`<polygon points="${f(cx)},${f(cy - sh / 2)} ${f(cx + sw / 2)},${f(cy)} ${f(cx - sw / 2)},${f(cy)}" fill="${fill}" opacity="${op}"/>`);
		shapes.push(`<polygon points="${f(cx + sw / 2)},${f(cy)} ${f(cx)},${f(cy + sh / 2)} ${f(cx - sw / 2)},${f(cy)}" fill="${fill2}" opacity="${op2}"/>`);
	}
	return svgWrap(W, H, shapes.join(''));
}

/** Bold corner geometry — large brand polygons at edges, clean white centre */
function buildGeoPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 200;
	const [c1, c2, c3] = brandPalette(readBranding().color, 3);
	const c4 = '#1a1a1a';
	const f = (n: number) => n.toFixed(0);
	const shapes: string[] = ['<rect width="600" height="200" fill="#fff"/>'];
	const tlW = W * (0.30 + rand() * 0.12), tlH = H * (0.70 + rand() * 0.18);
	shapes.push(`<polygon points="0,0 ${f(tlW)},0 ${f(tlW * 0.55)},${f(tlH * 0.45)} 0,${f(tlH)}" fill="${c1}"/>`);
	shapes.push(`<polygon points="0,0 ${f(tlW * 0.62)},0 0,${f(tlH * 0.42)}" fill="${c2}"/>`);
	shapes.push(`<polygon points="0,0 ${f(tlW * 0.25)},0 0,${f(tlH * 0.18)}" fill="${c4}" opacity="0.45"/>`);
	const trX = W * (0.68 + rand() * 0.08);
	shapes.push(`<polygon points="${f(trX)},0 ${f(W)},0 ${f(W)},${f(H * 0.62)}" fill="${c1}"/>`);
	shapes.push(`<polygon points="${f(trX + W * 0.08)},0 ${f(W)},0 ${f(W)},${f(H * 0.28)}" fill="${c3}"/>`);
	const brY = H * (0.40 + rand() * 0.14);
	shapes.push(`<polygon points="${f(W)},${f(brY)} ${f(W)},${f(H)} ${f(W * 0.62)},${f(H)}" fill="${c2}"/>`);
	shapes.push(`<polygon points="${f(W)},${f(brY + H * 0.12)} ${f(W)},${f(H)} ${f(W * 0.78)},${f(H)}" fill="${c4}" opacity="0.35"/>`);
	const blX = W * (0.26 + rand() * 0.10);
	shapes.push(`<polygon points="0,${f(H * 0.50)} ${f(blX)},${f(H)} 0,${f(H)}" fill="${c1}"/>`);
	shapes.push(`<polygon points="0,${f(H * 0.68)} ${f(blX * 0.52)},${f(H)} 0,${f(H)}" fill="${c3}"/>`);
	return svgWrap(W, H, shapes.join(''));
}

/** Connected mesh — Voronoi-style dots and edges in the brand color */
function buildMeshPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 200;
	const pts: [number, number][] = [];
	for (let i = 0; i < 55; i++) pts.push([rand() * W, rand() * H]);
	for (let i = 0; i < 6; i++) { pts.push([rand() * W, -4]); pts.push([rand() * W, H + 4]); pts.push([-4, rand() * H]); pts.push([W + 4, rand() * H]); }
	const lines: string[] = [], dots: string[] = [];
	const thresh = 110;
	for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
		const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
		if (d < thresh) lines.push(`<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}" stroke="var(--brand)" stroke-width="0.6" opacity="${((1 - d / thresh) * 0.28).toFixed(2)}"/>`);
	}
	for (let i = 0; i < 55; i++) dots.push(`<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${(1.2 + rand() * 2.2).toFixed(1)}" fill="var(--brand)" opacity="${(0.22 + rand() * 0.45).toFixed(2)}"/>`);
	return svgWrap(W, H, `<rect width="${W}" height="${H}" fill="#faf9f5"/>${lines.join('')}${dots.join('')}`);
}

// Pattern output is deterministic in (style, seed, brand.color). Cache by all
// three — a brand-color change must bust. Keyed as string for simplicity.
const patternCache = new Map<string, string>();

function memoPattern(style: string, seed: number, build: (s: number) => string): string {
	const key = `${style}:${seed}:${readBranding().color}`;
	let v = patternCache.get(key);
	if (v !== undefined) return v;
	v = build(seed);
	patternCache.set(key, v);
	// Unbounded cache is fine — templates use a tiny, deterministic style set.
	// In the unlikely event users cycle millions of doc titles, LRU can be
	// added; today the upper bound is ~4 × (unique-title count).
	return v;
}

/** Resolve `meta.cover` → an SVG string or image data URL. Null if disabled. */
export async function getCoverVisual(spec: CoverSpec): Promise<string | null> {
	const style = spec.style;
	if (style === false || style === 'none' || style === 'false') return null;
	const seed = titleHash(spec.seed);
	if (style === 'lowpoly') return memoPattern('lowpoly', seed, buildLowPolyPattern);
	if (style === 'diamond') return memoPattern('diamond', seed, buildDiamondPattern);
	if (style === 'geo') return memoPattern('geo', seed, buildGeoPattern);
	if (style === 'mesh') return memoPattern('mesh', seed, buildMeshPattern);
	if (style === 'image') return getCoverImageDataUrl(spec.image);
	return memoPattern('lowpoly', seed, buildLowPolyPattern);
}

// ── Attachments ───────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
	jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml'
};

/**
 * Inline every `/api/attachments/<file>` <img src> as a base64 data URL so
 * Puppeteer doesn't have to fetch them over HTTP. Storage reads run in
 * parallel — linear speedup when docs have many attachments.
 */
export async function inlineAttachments(wsId: string, html: string): Promise<string> {
	const { getBinary } = await import('../storage');
	const { attachmentsPrefix } = await import('../docsIndex');
	const matches = [...html.matchAll(/src="\/api\/attachments\/([^"?]+)(?:\?[^"]*)?"/g)];
	if (matches.length === 0) return html;

	const loaded = await Promise.all(
		matches.map(async ([full, filename]) => {
			const buf = await getBinary(`${attachmentsPrefix(wsId)}${filename}`);
			if (!buf) return null;
			const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
			const mime = MIME[ext] ?? 'image/png';
			const b64 = Buffer.from(buf).toString('base64');
			return { full, replacement: `src="data:${mime};base64,${b64}"` };
		})
	);

	for (const item of loaded) {
		if (item) html = html.replace(item.full, item.replacement);
	}
	return html;
}

// ── Branding version for cache keying ─────────────────────────────────────
// Templates and the cache layer both need a stable string that changes when
// branding changes. Logo file content isn't hashed (would require a storage
// read per cache check) — logo swaps rely on natural cache turnover.

export function brandingVersion(b: Branding): string {
	return `${b.name}|${b.color}|${b.company}`;
}
