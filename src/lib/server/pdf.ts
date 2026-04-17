import puppeteer from 'puppeteer';
import katexCssRaw from 'katex/dist/katex.min.css?raw';
import mermaidScript from 'mermaid/dist/mermaid.min.js?raw';
import QRCode from 'qrcode';
import { readFileSync } from 'node:fs';
import { readBranding } from '$lib/branding';

// Build-time inlining of Inter woff2 files from @fontsource/inter. The
// generated CSS is embedded in the PDF HTML so Puppeteer doesn't need to
// hit the Google Fonts CDN (which was blocking page.goto from Cloudflare).
function interFace(weight: number): string {
	try {
		const buf = readFileSync(`node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`);
		return `@font-face{font-family:'Inter';font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');}`;
	} catch {
		return '';
	}
}

const INTER_CSS = [300, 400, 500, 600, 700].map(interFace).join('');

// Repoint relative font URLs to the CDN so Puppeteer can load them
const KATEX_CSS = katexCssRaw.replace(
	/url\(fonts\//g,
	'url(https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/fonts/'
);

export interface FormalDocMeta {
	title: string;
	author?: string;
	date?: string;
	version?: string;
	doctype?: string;
	tags?: string[];
	footer?: string;
	approvals?: boolean | string[];
	/** 'lowpoly' | 'diamond' | 'geo' | 'mesh' | 'image' | false */
	cover?: string | boolean;
	/** Specific image filename from assets/covers/ to use as cover (e.g. 'plant.jpg') */
	coverImage?: string;
	/** Show CONFIDENCIAL badge in cover footer. Default: false */
	confidential?: boolean;
	/** Company name in cover footer. Defaults to BRAND_COMPANY env (or BRAND_NAME). */
	company?: string;
	/** Full URL of the live web doc — renders as QR code in cover footer (only when qrCode: true and doc is public) */
	docUrl?: string;
	/** Render a QR code linking to the public URL in the cover footer. Requires the doc to be public. */
	qrCode?: boolean;
}

// ── Brand-color palette derivation ────────────────────────────────────────
// Cover decorative patterns need a gradient of shades. We derive them from
// BRAND_COLOR via HSL so any brand hue produces a coherent palette.

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

/** Darker-shading gradient from base down to `minL` lightness. */
function brandPalette(base: string, count: number, minL = 0.15): string[] {
	const [h, s, l] = hexToHsl(base);
	const low = Math.min(l, minL);
	const out: string[] = [];
	for (let i = 0; i < count; i++) {
		const t = count === 1 ? 0 : i / (count - 1);
		out.push(hslToHex(h, s, l - t * (l - low)));
	}
	return out;
}

function brandRgba(base: string, alpha: number): string {
	const m = base.replace('#', '');
	return `rgba(${parseInt(m.slice(0, 2), 16)},${parseInt(m.slice(2, 4), 16)},${parseInt(m.slice(4, 6), 16)},${alpha})`;
}

async function readBrandingSvgDataUrl(file: string): Promise<string | null> {
	const { getBinary } = await import('./storage');
	const { prefixes } = await import('./docsIndex');
	const buf = await getBinary(`${prefixes.branding}${file}`);
	if (!buf) return null;
	return `data:image/svg+xml;base64,${Buffer.from(buf).toString('base64')}`;
}

/**
 * PDF cover logo. The cover header has a dark background, so when
 * `content/branding/logo-negative.svg` exists (an inverted / all-white
 * variant) we prefer it. Falls back to the main logo, then to text.
 */
async function getBrandLogoHtml(name: string, color: string, negative = false): Promise<string> {
	const url =
		(await readBrandingSvgDataUrl(negative ? 'logo-negative.svg' : 'logo.svg')) ??
		(negative ? await readBrandingSvgDataUrl('logo.svg') : null);

	if (url) {
		return `<img src="${url}" alt="${name}" style="height:36px;width:auto;display:block"/>`;
	}

	const textColor = negative ? '#ffffff' : color;
	return `<span style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-weight:700;font-size:20pt;color:${textColor};">${name}</span>`;
}

const CSS = `
/* ── Page rules ── */
@page {
  size: A4;
  margin: 22mm 20mm 20mm 20mm; /* content pages */
}

/* Cover: full bleed — no margins, no footer */
@page cover-page {
  margin: 0;
  @bottom-left  { content: none; }
  @bottom-right { content: none; }
}

/* TOC: normal margins, no footer */
@page toc-page {
  @bottom-left  { content: none; }
  @bottom-right { content: none; }
}

.cover    { page: cover-page; }
.toc-page { page: toc-page; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body { margin: 0; padding: 0; }

html {
  font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  font-size: 10.5pt;
  line-height: 1.7;
  color: #1a1a1a;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ══════════════════════════════════════
   COVER PAGE
══════════════════════════════════════ */

.cover {
  width: 100%;
  height: 297mm; /* full A4 — cover-page has margin:0 so full bleed */
  display: flex;
  flex-direction: row;
  break-after: page;
  overflow: hidden;
  background: #fff;
}

/* Left accent spine */
.cover-spine {
  width: 14mm;
  background: var(--brand);
  flex-shrink: 0;
  position: relative;
}

.cover-spine-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 14mm;
  overflow: hidden;
}

.cover-spine-label span {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-height: 200mm;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 6pt;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.65);
}

/* Right content area */
.cover-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
}

/* Header band */
.cover-header {
  background: #1a1a1a;
  padding: 9mm 12mm 9mm 14mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cover-header-right {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7pt;
  color: rgba(255,255,255,0.4);
  text-align: right;
  line-height: 1.5;
}

/* Cover visual — absolutely positioned behind the text content */
.cover-visual {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 0;
}

.cover-visual img, .cover-visual svg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
  display: block;
}

/* Fade the visual's own opacity so the white body background shows through —
   no color mixing, no tinting */
.cover-visual--faded {
  -webkit-mask-image: linear-gradient(to bottom,
    transparent 0%,
    black       18%,
    black       72%,
    transparent 100%
  );
  mask-image: linear-gradient(to bottom,
    transparent 0%,
    black       18%,
    black       72%,
    transparent 100%
  );
}

/* Main body — white background revealed where the visual mask is transparent */
.cover-body {
  flex: 1;
  padding: 8mm 14mm 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  position: relative;
  background-color: #fff;
}

/* Text content sits above the visual */
.cover-body-text {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.cover-doctype {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--brand);
  margin-bottom: 5mm;
}

.cover-title {
  font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  font-size: 30pt;
  font-weight: 700;
  line-height: 1.15;
  color: #0f0f0f;
  margin-bottom: 8mm;
  border-left: 4px solid var(--brand);
  padding-left: 6mm;
}

.cover-description {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10pt;
  color: #666;
  line-height: 1.6;
  max-width: 120mm;
  margin-bottom: 12mm;
  padding-left: 10mm;
}

/* Meta grid */
.cover-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: #e8e5df;
  border: 1px solid #e8e5df;
  border-radius: 4px;
  overflow: hidden;
  margin-top: auto;
  margin-bottom: 12mm;
}

.meta-cell {
  background: #fafaf8;
  padding: 4mm 5mm;
}

.meta-cell.full { grid-column: 1 / -1; }

.meta-label {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 6.5pt;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #aaa;
  margin-bottom: 1mm;
}

.meta-value {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9.5pt;
  font-weight: 500;
  color: #1a1a1a;
}

/* Footer strip */
.cover-footer {
  background: #f5f3ee;
  border-top: 1px solid #e0ddd5;
  padding: 4mm 14mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7pt;
  color: #aaa;
}

.cover-confidential {
  background: #1a1a1a;
  color: #fff;
  padding: 0.2em 0.7em;
  border-radius: 3px;
  font-size: 6.5pt;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.cover-footer-right {
  display: flex;
  align-items: center;
  gap: 4mm;
}

.cover-qr {
  width: 28mm;
  height: 28mm;
  flex-shrink: 0;
}

.cover-qr svg {
  width: 100%;
  height: 100%;
}

/* ══════════════════════════════════════
   TOC PAGE
══════════════════════════════════════ */

.toc-page {
  page-break-after: always;
  padding: 16mm 0 12mm;
}

.toc-page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 2px solid #1a1a1a;
  padding-bottom: 3mm;
  margin-bottom: 8mm;
}

.toc-page-title {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #1a1a1a;
}

.toc-page-doc {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7pt;
  color: #aaa;
}

.toc-entries { list-style: none; padding: 0; }

.toc-entry {
  display: flex;
  align-items: baseline;
  gap: 0;
  padding: 1.8mm 0;
  border-bottom: 1px solid #f0ede6;
}

.toc-entry.h1 { padding: 2.5mm 0 1.5mm; border-bottom: 1px solid #e8e5df; }
.toc-entry.h1:not(:first-child) { margin-top: 1.5mm; }
.toc-entry.h2 { padding-left: 5mm; }
.toc-entry.h3 { padding-left: 10mm; color: #666; }

.toc-num {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 8pt;
  color: #aaa;
  min-width: 8mm;
  flex-shrink: 0;
}

.toc-text {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9pt;
  color: #1a1a1a;
  flex: 1;
}

.toc-entry.h1 .toc-text { font-weight: 600; font-size: 9.5pt; }
.toc-entry.h3 .toc-text { font-size: 8.5pt; color: #666; }

.toc-fill {
  flex: 1;
  border-bottom: 1px dotted #ccc;
  margin: 0 2mm 1.5mm;
  min-width: 4mm;
}

.toc-pg {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 8.5pt;
  color: #888;
  min-width: 6mm;
  text-align: right;
  flex-shrink: 0;
}

/* ══════════════════════════════════════
   DOCUMENT BODY
══════════════════════════════════════ */

.doc-content {
  padding-top: 2mm;
}

.doc-content h1 {
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.2;
  color: #0f0f0f;
  margin: 8mm 0 4mm;
  padding-bottom: 2.5mm;
  border-bottom: 2px solid #1a1a1a;
  page-break-after: avoid;
}

.doc-content h1:first-child { margin-top: 0; }

.doc-content h2 {
  font-size: 12pt;
  font-weight: 700;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  margin: 7mm 0 3mm;
  color: #1a1a1a;
  padding-bottom: 1.5mm;
  border-bottom: 1px solid #e0ddd5;
  page-break-after: avoid;
}

.doc-content h3 {
  font-size: 10.5pt;
  font-weight: 600;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  margin: 5mm 0 2mm;
  color: #333;
  page-break-after: avoid;
}

.doc-content h4 {
  font-size: 10pt;
  font-weight: 600;
  font-style: italic;
  margin: 4mm 0 1.5mm;
  page-break-after: avoid;
}

.doc-content p { margin: 0 0 3.5mm; orphans: 3; widows: 3; }

.doc-content a { color: #1a1a1a; text-decoration: underline; }

.doc-content a.wiki-link {
  color: #7c3aed;
  text-decoration: none;
  border-bottom: 1px dashed #c4b5fd;
  font-style: italic;
}

.doc-content ul, .doc-content ol {
  padding-left: 6mm;
  margin: 0 0 3.5mm;
}

.doc-content li { margin-bottom: 1mm; }
.doc-content li > p { margin-bottom: 1mm; }

.doc-content blockquote {
  margin: 4mm 0;
  padding: 2mm 4mm 2mm 5mm;
  border-left: 3px solid var(--brand);
  background: #fdf8f6;
  color: #444;
  font-style: italic;
  border-radius: 0 3px 3px 0;
}

.doc-content code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 8.5pt;
  background: #f5f2eb;
  padding: 0.1em 0.35em;
  border-radius: 2px;
  color: #b5470d;
}

.doc-content pre {
  background: #f8f6f0;
  border: 1px solid #e0ddd5;
  border-left: 3px solid #d1c9b0;
  border-radius: 3px;
  padding: 3.5mm 4.5mm;
  margin: 3.5mm 0;
  page-break-inside: avoid;
}

.doc-content pre code {
  background: none;
  padding: 0;
  color: #1a1a1a;
  font-size: 8pt;
  border-radius: 0;
}

.doc-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 4mm 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}

.doc-content th {
  background: #1a1a1a;
  color: #fff;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 600;
  font-size: 8.5pt;
  text-align: left;
  padding: 2.5mm 4mm;
  letter-spacing: 0.03em;
}

.doc-content td {
  padding: 2.2mm 4mm;
  border-bottom: 1px solid #e8e5df;
  vertical-align: top;
}

.doc-content tr:last-child td { border-bottom: none; }
.doc-content tr:nth-child(even) td { background: #faf9f5; }

.doc-content hr {
  border: none;
  border-top: 1px solid #e0ddd5;
  margin: 6mm 0;
}

.doc-content img { max-width: 100%; height: auto; border-radius: 2px; }

.doc-content pre.mermaid {
  background: #fff;
  border: 1px solid #e0ddd5;
  border-radius: 4px;
  padding: 6mm;
  text-align: center;
  page-break-inside: avoid;
}

.doc-content pre.mermaid svg {
  max-width: 100%;
  height: auto;
}

/* ══════════════════════════════════════
   SIGNATURE BLOCK
══════════════════════════════════════ */

.signature-block {
  margin-top: 12mm;
  page-break-inside: avoid;
}

.signature-block-title {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #aaa;
  margin-bottom: 5mm;
  padding-bottom: 2mm;
  border-bottom: 1px solid #e0ddd5;
}

.sig-row { display: flex; gap: 8mm; }

.sig-field { flex: 1; }

.sig-line {
  border-bottom: 1.5px solid #1a1a1a;
  margin-bottom: 2mm;
  height: 10mm;
}

.sig-name {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 8.5pt;
  font-weight: 500;
  color: #1a1a1a;
}

.sig-role {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7.5pt;
  color: #888;
  margin-top: 0.5mm;
}

.sig-date {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 7pt;
  color: #bbb;
  margin-top: 1.5mm;
}
`;

// ── Cover visual helpers ──────────────────────────────────────────────────────

// ── Cover visual system ───────────────────────────────────────────────────────

async function getCoverImageDataUrl(filename?: string): Promise<string | null> {
	if (!filename) return null;
	const { getBinary } = await import('./storage');
	const { prefixes } = await import('./docsIndex');
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

/** Mulberry32 PRNG — fast, good distribution */
function seededRand(seed: number) {
	let s = seed | 0;
	return () => { s = Math.imul(s ^ (s >>> 15), s | 1); s ^= s + Math.imul(s ^ (s >>> 7), s | 61); return ((s ^ (s >>> 14)) >>> 0) / 0x100000000; };
}

function svgWrap(W: number, H: number, content: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:100%">${content}</svg>`;
}

/** Dark low-poly triangulation — default dark pattern with red accents */
function buildLowPolyPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 180, cols = 9, rows = 5;
	const cw = W / (cols - 1), ch = H / (rows - 1);
	const pts: [number, number][] = [];
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
			pts.push([Math.max(0, Math.min(W, c*cw + (edge ? 0 : (rand()-0.5)*18))), Math.max(0, Math.min(H, r*ch + (edge ? 0 : (rand()-0.5)*14)))]);
		}
	const darks = ['#0a0a0a','#0f0f0f','#141414','#191919','#1e1e1e','#232323','#282828','#2e2e2e','#333','#393939'];
	const reds  = brandPalette(readBranding().color, 6);
	const f = (n: number) => n.toFixed(1);
	const polys: string[] = [`<rect width="${W}" height="${H}" fill="#0a0a0a"/>`];
	let ti = 0;
	for (let r = 0; r < rows-1; r++) for (let c = 0; c < cols-1; c++) {
		const [tl, tr, bl, br] = [pts[r*cols+c], pts[r*cols+c+1], pts[(r+1)*cols+c], pts[(r+1)*cols+c+1]];
		const col = (cx: number, i: number) => { const h = ((i*2654435761)>>>0)%10000; return (h<1300 && cx/W>0.15 && cx/W<0.88) ? reds[h%reds.length] : darks[(h%darks.length+Math.floor(cx/W*3))%darks.length]; };
		polys.push(`<polygon points="${f(tl[0])},${f(tl[1])} ${f(tr[0])},${f(tr[1])} ${f(bl[0])},${f(bl[1])}" fill="${col((tl[0]+tr[0]+bl[0])/3,ti++)}"/>`);
		polys.push(`<polygon points="${f(tr[0])},${f(tr[1])} ${f(bl[0])},${f(bl[1])} ${f(br[0])},${f(br[1])}" fill="${col((tr[0]+bl[0]+br[0])/3,ti++)}"/>`);
	}
	return svgWrap(W, H, polys.join(''));
}

/** Crystalline diamond grid — brand-derived shades on white, with gradient blends */
function buildDiamondPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 200;
	const brand = readBranding().color;
	const reds   = brandPalette(brand, 8);
	const darks  = ['#1a1a1a','#242424','#2e2e2e','#383838'];
	const lights = [brandRgba(brand, 0.18), brandRgba(brand, 0.12), 'rgba(26,26,26,0.10)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.5)'];
	const dw = 30, dh = 19;
	const shapes: string[] = ['<rect width="600" height="200" fill="#fff"/>'];
	const cols = Math.ceil(W/dw)+3, rows = Math.ceil(H/dh)+3;
	const f = (n: number) => n.toFixed(1);
	for (let r = -1; r < rows; r++) for (let c = -1; c < cols; c++) {
		const cx = c*dw + (r%2 ? dw/2 : 0), cy = r*dh;
		const sw = dw*(0.72+rand()*0.5), sh = dh*(0.72+rand()*0.5);
		const rv = rand();
		const fill  = rv<0.20 ? reds[Math.floor(rand()*reds.length)]  : rv<0.30 ? darks[Math.floor(rand()*darks.length)] : lights[Math.floor(rand()*lights.length)];
		const fill2 = rv<0.20 ? reds[(Math.floor(rand()*reds.length)+3)%reds.length] : fill;
		const op  = (0.35+rand()*0.65).toFixed(2);
		const op2 = Math.min(1, parseFloat(op)*(0.65+rand()*0.5)).toFixed(2);
		// Upper & lower triangles of each diamond for prismatic depth
		shapes.push(`<polygon points="${f(cx)},${f(cy-sh/2)} ${f(cx+sw/2)},${f(cy)} ${f(cx-sw/2)},${f(cy)}" fill="${fill}" opacity="${op}"/>`);
		shapes.push(`<polygon points="${f(cx+sw/2)},${f(cy)} ${f(cx)},${f(cy+sh/2)} ${f(cx-sw/2)},${f(cy)}" fill="${fill2}" opacity="${op2}"/>`);
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
	// Top-left cluster
	const tlW = W*(0.30+rand()*0.12), tlH = H*(0.70+rand()*0.18);
	shapes.push(`<polygon points="0,0 ${f(tlW)},0 ${f(tlW*0.55)},${f(tlH*0.45)} 0,${f(tlH)}" fill="${c1}"/>`);
	shapes.push(`<polygon points="0,0 ${f(tlW*0.62)},0 0,${f(tlH*0.42)}" fill="${c2}"/>`);
	shapes.push(`<polygon points="0,0 ${f(tlW*0.25)},0 0,${f(tlH*0.18)}" fill="${c4}" opacity="0.45"/>`);
	// Top-right cluster
	const trX = W*(0.68+rand()*0.08);
	shapes.push(`<polygon points="${f(trX)},0 ${f(W)},0 ${f(W)},${f(H*0.62)}" fill="${c1}"/>`);
	shapes.push(`<polygon points="${f(trX+W*0.08)},0 ${f(W)},0 ${f(W)},${f(H*0.28)}" fill="${c3}"/>`);
	// Bottom-right cluster
	const brY = H*(0.40+rand()*0.14);
	shapes.push(`<polygon points="${f(W)},${f(brY)} ${f(W)},${f(H)} ${f(W*0.62)},${f(H)}" fill="${c2}"/>`);
	shapes.push(`<polygon points="${f(W)},${f(brY+H*0.12)} ${f(W)},${f(H)} ${f(W*0.78)},${f(H)}" fill="${c4}" opacity="0.35"/>`);
	// Bottom-left cluster
	const blX = W*(0.26+rand()*0.10);
	shapes.push(`<polygon points="0,${f(H*0.50)} ${f(blX)},${f(H)} 0,${f(H)}" fill="${c1}"/>`);
	shapes.push(`<polygon points="0,${f(H*0.68)} ${f(blX*0.52)},${f(H)} 0,${f(H)}" fill="${c3}"/>`);
	return svgWrap(W, H, shapes.join(''));
}

/** Connected mesh — Voronoi-style dots and edges in the brand color */
function buildMeshPattern(seed: number): string {
	const rand = seededRand(seed);
	const W = 600, H = 200;
	const pts: [number, number][] = [];
	for (let i = 0; i < 55; i++) pts.push([rand()*W, rand()*H]);
	for (let i = 0; i < 6; i++) { pts.push([rand()*W, -4]); pts.push([rand()*W, H+4]); pts.push([-4, rand()*H]); pts.push([W+4, rand()*H]); }
	const lines: string[] = [], dots: string[] = [];
	const thresh = 110;
	for (let i = 0; i < pts.length; i++) for (let j = i+1; j < pts.length; j++) {
		const d = Math.hypot(pts[i][0]-pts[j][0], pts[i][1]-pts[j][1]);
		if (d < thresh) lines.push(`<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}" stroke="var(--brand)" stroke-width="0.6" opacity="${((1-d/thresh)*0.28).toFixed(2)}"/>`);
	}
	for (let i = 0; i < 55; i++) dots.push(`<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="${(1.2+rand()*2.2).toFixed(1)}" fill="var(--brand)" opacity="${(0.22+rand()*0.45).toFixed(2)}"/>`);
	return svgWrap(W, H, `<rect width="${W}" height="${H}" fill="#faf9f5"/>${lines.join('')}${dots.join('')}`);
}

/** Dispatch cover visual based on meta.cover value */
async function getCoverVisual(meta: FormalDocMeta): Promise<string | null> {
	const style = meta.cover;
	if (style === false || style === 'none' || style === 'false') return null;
	const seed = titleHash(meta.title);
	if (style === 'lowpoly')  return buildLowPolyPattern(seed);
	if (style === 'diamond')  return buildDiamondPattern(seed);
	if (style === 'geo')      return buildGeoPattern(seed);
	if (style === 'mesh')     return buildMeshPattern(seed);
	if (style === 'image')    return getCoverImageDataUrl(meta.coverImage);
	// Default (omitted): lowpoly pattern
	return buildLowPolyPattern(seed);
}

async function buildHtml(
	meta: FormalDocMeta,
	bodyHtml: string,
	toc: { level: number; id: string; text: string }[],
	tocPageNumbers: Record<string, number> = {},
	coverVisual: string | null = null
): Promise<string> {
	const { readBranding } = await import('$lib/branding');
	const branding = readBranding();
	const brandLogoHtml = await getBrandLogoHtml(branding.name, branding.color, true);
	const qrSvg = meta.docUrl
		? await QRCode.toString(meta.docUrl, { type: 'svg', width: 80, margin: 1 })
		: null;
	const dateFormatted = meta.date
		? new Date(meta.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
		: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

	const hasToc = toc.length > 2;
	const contentStartPage = hasToc ? 3 : 2;

	const tocHtml = hasToc ? `
<div class="toc-page">
	<div class="toc-page-header">
		<span class="toc-page-title">Índice</span>
		<span class="toc-page-doc">${meta.title}</span>
	</div>
	<ol class="toc-entries">
		${toc.map((e, i) => {
			const pg = tocPageNumbers[e.id] !== undefined
				? contentStartPage + tocPageNumbers[e.id]
				: '—';
			return `<li class="toc-entry h${e.level}" data-toc-id="${e.id}">
				<span class="toc-num">${e.level === 1 ? `${i + 1}.` : ''}</span>
				<span class="toc-text">${e.text}</span>
				<span class="toc-fill"></span>
				<span class="toc-pg">${pg}</span>
			</li>`;
		}).join('\n')}
	</ol>
</div>` : '';

	const defaultRoles = ['Elaboração', 'Revisão', 'Aprovação'];
	const approvalRoles: string[] | null =
		!meta.approvals
			? null
			: Array.isArray(meta.approvals)
				? meta.approvals
				: defaultRoles;

	const sigBlock = approvalRoles ? `
<div class="signature-block">
	<div class="signature-block-title">Aprovações</div>
	<div class="sig-row">
		${approvalRoles.map((role, i) => `
		<div class="sig-field">
			<div class="sig-line"></div>
			<div class="sig-name">${i === 0 && meta.author ? meta.author : '__________________________'}</div>
			<div class="sig-role">${role}</div>
			<div class="sig-date">Data: _____ / _____ / _________</div>
		</div>`).join('')}
	</div>
</div>` : '';

	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${meta.title}</title>
<style>${INTER_CSS}</style>
<style>${KATEX_CSS}</style>
<style>:root { --brand: ${branding.color}; } ${CSS}</style>
<script>${mermaidScript}</script>
<script>
  window.__mermaidDone = false;
  document.addEventListener('DOMContentLoaded', async () => {
    var nodes = document.querySelectorAll('.mermaid');
    if (nodes.length === 0) { window.__mermaidDone = true; return; }
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    await mermaid.run({ querySelector: '.mermaid' });
    window.__mermaidDone = true;
  });
</script>
</head>
<body>

<!-- ── COVER ── -->
<div class="cover">
	<div class="cover-spine">
		<div class="cover-spine-label"><span>${meta.doctype ?? 'Documento Formal'}</span></div>
	</div>
	<div class="cover-content">
		<div class="cover-header">
			${brandLogoHtml}
			<div class="cover-header-right">
				${meta.version ? `Versão ${meta.version}<br/>` : ''}${dateFormatted}
			</div>
		</div>

		<div class="cover-body">
			${coverVisual ? `
			<div class="cover-visual cover-visual--faded">${coverVisual.startsWith('data:') ? `<img src="${coverVisual}" alt=""/>` : coverVisual}</div>` : ''}

			<div class="cover-body-text">
			<div class="cover-doctype">${meta.doctype ?? 'Documento Formal'}</div>
			<h1 class="cover-title">${meta.title}</h1>

			<div class="cover-meta-grid">
				${meta.author ? `
				<div class="meta-cell">
					<div class="meta-label">Autor</div>
					<div class="meta-value">${meta.author}</div>
				</div>` : ''}
				<div class="meta-cell">
					<div class="meta-label">Data</div>
					<div class="meta-value">${dateFormatted}</div>
				</div>
				${meta.version ? `
				<div class="meta-cell">
					<div class="meta-label">Versão</div>
					<div class="meta-value">${meta.version}</div>
				</div>` : ''}
				${meta.tags?.length ? `
				<div class="meta-cell ${!meta.version ? 'full' : ''}">
					<div class="meta-label">Classificação</div>
					<div class="meta-value">${meta.tags.join(' · ')}</div>
				</div>` : ''}
			</div>
			</div><!-- /.cover-body-text -->
		</div>

		<div class="cover-footer">
			<span>${meta.company ?? branding.company}</span>
			<div class="cover-footer-right">
				${meta.confidential ? '<span class="cover-confidential">Confidencial</span>' : ''}
				${qrSvg ? `<div class="cover-qr">${qrSvg}</div>` : ''}
			</div>
		</div>
	</div>
</div>

${tocHtml}

<!-- ── CONTENT ── -->
<div class="doc-content">
${bodyHtml}
${sigBlock}
</div>

</body>
</html>`;
}

// ── Singleton browser — launched once, reused for every request ──
const A4_CONTENT_HEIGHT_PX = 930;

import type { Browser } from 'puppeteer';

const DEBUG = process.env.DEBUG === 'true';
function log(msg: string) {
	if (DEBUG) console.log(`[pdf] ${new Date().toISOString()} ${msg}`);
}

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
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
	});
	log(`browser ready in ${Date.now() - t}ms`);
	_browser.on('disconnected', () => {
		log('browser disconnected — will relaunch on next request');
		_browser = null;
	});
	return _browser;
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

async function inlineAttachments(wsId: string, html: string): Promise<string> {
	const { getBinary } = await import('./storage');
	const { attachmentsPrefix } = await import('./docsIndex');
	// Strip any existing `?ws=...` from src URLs before matching the filename.
	const matches = [...html.matchAll(/src="\/api\/attachments\/([^"?]+)(?:\?[^"]*)?"/g)];
	for (const [full, filename] of matches) {
		const buf = await getBinary(`${attachmentsPrefix(wsId)}${filename}`);
		if (!buf) continue;
		const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
		const mime = MIME[ext] ?? 'image/png';
		const b64 = Buffer.from(buf).toString('base64');
		html = html.replace(full, `src="data:${mime};base64,${b64}"`);
	}
	return html;
}

export async function renderPdf(
	meta: FormalDocMeta,
	bodyHtml: string,
	toc: { level: number; id: string; text: string }[],
	wsId: string
): Promise<Buffer> {
	log(`starting PDF render: "${meta.title}"`);

	const browser = await getBrowser();
	const t0 = Date.now();
	const page = await browser.newPage();
	const tmpPath = `/tmp/pdf-${Date.now()}.html`;

	try {
		await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

		// Write to temp file — page.goto(file://) is more reliable than
		// setContent() in Puppeteer v24+ with large HTML / external font links
		log('loading HTML...');
		const t1 = Date.now();
		const coverVisual = await getCoverVisual(meta);
		const inlinedHtml = await inlineAttachments(wsId, bodyHtml);
		const html = await buildHtml(meta, inlinedHtml, toc, {}, coverVisual);
		await Bun.write(tmpPath, html);
		await page.goto(`file://${tmpPath}`, { waitUntil: 'load', timeout: 60000 });
		await page.waitForFunction(() => (window as any).__mermaidDone === true, { timeout: 30000 });
		log(`loaded in ${Date.now() - t1}ms`);

		const hasToc = toc.length > 2;
		const contentStartPage = hasToc ? 3 : 2;
		const patched = await page.evaluate((pageH: number, startPage: number) => {
			const content = document.querySelector('.doc-content') as HTMLElement;
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
		}, A4_CONTENT_HEIGHT_PX, contentStartPage);
		log(`TOC patched: ${patched} entries`);

		// Inject footer text into the page via a dynamic <style> block so
		// @page margin boxes can reference it. Cover and TOC use named pages
		// that have no @bottom rules, so they get no footer.
		const footerLeft = meta.footer ?? '';
		await page.evaluate((left: string) => {
			const style = document.createElement('style');
			style.textContent = `
				@page {
					@bottom-left {
						content: "${left.replace(/"/g, '\\"')}";
						font-family: 'Helvetica Neue', Arial, sans-serif;
						font-size: 7.5pt;
						color: #aaa;
					}
					@bottom-right {
						content: counter(page) " / " counter(pages);
						font-family: 'Helvetica Neue', Arial, sans-serif;
						font-size: 7.5pt;
						color: #aaa;
					}
				}
			`;
			document.head.appendChild(style);
		}, footerLeft);

		log('generating PDF bytes...');
		const t3 = Date.now();
		const pdf = await page.pdf({
			format: 'A4',
			printBackground: true,
			displayHeaderFooter: false,
		});
		log(`PDF generated in ${Date.now() - t3}ms — ${(pdf.byteLength / 1024).toFixed(1)} KB`);
		log(`total render time: ${Date.now() - t0}ms`);

		return Buffer.from(pdf);
	} finally {
		await page.close();
		log('page closed');
		// Best-effort temp file cleanup
		Bun.file(tmpPath).exists().then(exists => { if (exists) Bun.spawn(['rm', '-f', tmpPath]); });
	}
}
