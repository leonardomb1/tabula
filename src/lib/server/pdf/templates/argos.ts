/**
 * The "argos" template: corporate document layout with a styled cover,
 * optional TOC, body, and optional approval signatures.
 *
 * Reads its options from `frontmatter.argos` when present, falling back to
 * the flat legacy keys (`doctype`, `cover`, `version`, `approvals`, etc.)
 * that predated the namespaced layout — docs written before this refactor
 * keep rendering unchanged.
 */

interface ArgosOptions {
	doctype?: string;
	cover?: string | boolean;
	coverImage?: string;
	version?: string;
	approvals?: boolean | string[];
	confidential?: boolean;
	company?: string;
	footer?: string;
	qrCode?: boolean;
}

function readOptions(raw: Record<string, unknown>): ArgosOptions {
	const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
	const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
	const asStrOrBool = (v: unknown): string | boolean | undefined =>
		typeof v === 'string' || typeof v === 'boolean' ? v : undefined;
	const asApprovals = (v: unknown): boolean | string[] | undefined => {
		if (typeof v === 'boolean') return v;
		if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
		return undefined;
	};

	return {
		doctype: asString(raw.doctype),
		cover: asStrOrBool(raw.cover),
		coverImage: asString(raw.coverImage),
		version: asString(raw.version),
		approvals: asApprovals(raw.approvals),
		confidential: asBool(raw.confidential),
		company: asString(raw.company),
		footer: asString(raw.footer),
		qrCode: asBool(raw.qrCode)
	};
}

import QRCode from 'qrcode';
import mermaidScript from 'mermaid/dist/mermaid.min.js?raw';
import { getBrandLogoHtml, INTER_CSS, KATEX_CSS, needsKatex, needsMermaid } from '../shared';
import type { RenderContext, Template } from '../templates';

const CSS = `
/* ── Page rules ── */
@page {
  size: A4;
  margin: 22mm 20mm 20mm 20mm;
}

@page cover-page {
  /* Named pages don't reliably inherit the size descriptor from the
     default @page in Chromium — omitting it makes the cover render on
     Letter-sized sheets, leaving ~17 mm of blank space at the bottom of
     the A4 output. Re-declaring pins it. */
  size: A4;
  margin: 0;
  @bottom-left  { content: none; }
  @bottom-right { content: none; }
}

@page toc-page {
  size: A4;
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
  height: 297mm;
  display: flex;
  flex-direction: row;
  break-after: page;
  overflow: hidden;
  background: #fff;
}

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

.cover-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
}

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

.cover-body {
  flex: 1;
  padding: 8mm 14mm 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  position: relative;
  background-color: #fff;
}

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

.doc-content p {
  margin: 0 0 3.5mm;
  orphans: 3;
  widows: 3;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}

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

// ── Shared cover markup ──────────────────────────────────────────────────
// Used by both buildCover (fast path) and buildFull. The two call sites
// share identical cover HTML so preview and final export look identical on
// page 1.

function formatDate(date?: string): string {
	const d = date ? new Date(date) : new Date();
	return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function buildCoverMarkup(
	ctx: RenderContext,
	opts: ArgosOptions,
	qrSvg: string | null
): Promise<string> {
	const { meta, branding, coverVisual } = ctx;
	const brandLogoHtml = await getBrandLogoHtml(branding.name, branding.color, true);
	const dateFormatted = formatDate(meta.date);
	const authorStr = Array.isArray(meta.author) ? meta.author.join(', ') : meta.author;
	const doctype = opts.doctype ?? 'Documento Formal';

	return `
<div class="cover">
	<div class="cover-spine">
		<div class="cover-spine-label"><span>${doctype}</span></div>
	</div>
	<div class="cover-content">
		<div class="cover-header">
			${brandLogoHtml}
			<div class="cover-header-right">
				${opts.version ? `Versão ${opts.version}<br/>` : ''}${dateFormatted}
			</div>
		</div>

		<div class="cover-body">
			${coverVisual ? `
			<div class="cover-visual cover-visual--faded">${coverVisual.startsWith('data:') ? `<img src="${coverVisual}" alt=""/>` : coverVisual}</div>` : ''}

			<div class="cover-body-text">
			<div class="cover-doctype">${doctype}</div>
			<h1 class="cover-title">${meta.title}</h1>

			<div class="cover-meta-grid">
				${authorStr ? `
				<div class="meta-cell">
					<div class="meta-label">Autor</div>
					<div class="meta-value">${authorStr}</div>
				</div>` : ''}
				<div class="meta-cell">
					<div class="meta-label">Data</div>
					<div class="meta-value">${dateFormatted}</div>
				</div>
				${opts.version ? `
				<div class="meta-cell">
					<div class="meta-label">Versão</div>
					<div class="meta-value">${opts.version}</div>
				</div>` : ''}
				${meta.tags?.length ? `
				<div class="meta-cell ${!opts.version ? 'full' : ''}">
					<div class="meta-label">Classificação</div>
					<div class="meta-value">${meta.tags.join(' · ')}</div>
				</div>` : ''}
			</div>
			</div>
		</div>

		<div class="cover-footer">
			<span>${opts.company ?? branding.company}</span>
			<div class="cover-footer-right">
				${opts.confidential ? '<span class="cover-confidential">Confidencial</span>' : ''}
				${qrSvg ? `<div class="cover-qr">${qrSvg}</div>` : ''}
			</div>
		</div>
	</div>
</div>`;
}

async function maybeQrSvg(meta: { docUrl?: string }): Promise<string | null> {
	if (!meta.docUrl) return null;
	return QRCode.toString(meta.docUrl, { type: 'svg', width: 80, margin: 1 });
}

function buildTocHtml(ctx: RenderContext): string {
	const { meta, toc } = ctx;
	if (toc.length <= 2) return '';

	return `
<div class="toc-page">
	<div class="toc-page-header">
		<span class="toc-page-title">Índice</span>
		<span class="toc-page-doc">${meta.title}</span>
	</div>
	<ol class="toc-entries">
		${toc.map((e, i) => `<li class="toc-entry h${e.level}" data-toc-id="${e.id}">
			<span class="toc-num">${e.level === 1 ? `${i + 1}.` : ''}</span>
			<span class="toc-text">${e.text}</span>
			<span class="toc-fill"></span>
			<span class="toc-pg">—</span>
		</li>`).join('\n')}
	</ol>
</div>`;
}

function buildSignatureBlock(meta: RenderContext['meta'], opts: ArgosOptions): string {
	const defaultRoles = ['Elaboração', 'Revisão', 'Aprovação'];
	const approvalRoles =
		!opts.approvals ? null :
			Array.isArray(opts.approvals) ? opts.approvals : defaultRoles;

	if (!approvalRoles) return '';

	const author = Array.isArray(meta.author) ? meta.author[0] : meta.author;

	return `
<div class="signature-block">
	<div class="signature-block-title">Aprovações</div>
	<div class="sig-row">
		${approvalRoles.map((role: string, i: number) => `
		<div class="sig-field">
			<div class="sig-line"></div>
			<div class="sig-name">${i === 0 && author ? author : '__________________________'}</div>
			<div class="sig-role">${role}</div>
			<div class="sig-date">Data: _____ / _____ / _________</div>
		</div>`).join('')}
	</div>
</div>`;
}

function wrapDoc(
	title: string,
	brandColor: string,
	bodyMarkup: string,
	opts: { needsMermaid: boolean; needsKatex: boolean; footer: string }
): string {
	// Puppeteer waits on window.__mermaidDone. When mermaid isn't needed,
	// set it true immediately so waitForFunction returns fast; when it is,
	// ship the library inline + a tiny runner that flips the flag once run.
	const mermaidTags = opts.needsMermaid
		? `<script>${mermaidScript}</script>
<script>
  window.__mermaidDone = false;
  document.addEventListener('DOMContentLoaded', async () => {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
    await mermaid.run({ querySelector: '.mermaid' });
    window.__mermaidDone = true;
  });
</script>`
		: `<script>window.__mermaidDone = true;</script>`;

	const katexTag = opts.needsKatex ? `<style>${KATEX_CSS}</style>` : '';

	// Per-render @page rule with the footer baked in. cover-page and
	// toc-page already override @bottom-* to `none` in the static CSS, so
	// the cover + TOC stay clean.
	const escapedFooter = opts.footer.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	const footerCss = `
		@page {
			@bottom-left {
				content: "${escapedFooter}";
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
		}`;

	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>${INTER_CSS}</style>
${katexTag}
<style>:root { --brand: ${brandColor}; } ${CSS} ${footerCss}</style>
${mermaidTags}
</head>
<body>
${bodyMarkup}
</body>
</html>`;
}

// ── Template export ──────────────────────────────────────────────────────

export const argos: Template = {
	id: 'argos',
	label: 'Argos — Documento Formal',

	async buildFull(ctx: RenderContext): Promise<string> {
		const opts = readOptions(ctx.options);
		const qrSvg = await maybeQrSvg(ctx.meta);
		const coverMarkup = await buildCoverMarkup(ctx, opts, qrSvg);
		const tocMarkup = buildTocHtml(ctx);
		const signatureMarkup = buildSignatureBlock(ctx.meta, opts);
		const mermaidNeeded = needsMermaid(ctx.bodyHtml);
		const katexNeeded = needsKatex(ctx.bodyHtml);

		const body = `
${coverMarkup}

${tocMarkup}

<div class="doc-content">
${ctx.bodyHtml}
${signatureMarkup}
</div>`;

		return wrapDoc(ctx.meta.title, ctx.branding.color, body, {
			needsMermaid: mermaidNeeded,
			needsKatex: katexNeeded,
			footer: opts.footer ?? ''
		});
	},

	preTextualPages(ctx) {
		// Cover is always emitted; TOC page only when the doc has enough
		// headings to bother rendering it.
		return ctx.toc.length > 2 ? 2 : 1;
	}
};
export const FORMAL_CONTENT_START_PAGE_WITHOUT_TOC = 2;
