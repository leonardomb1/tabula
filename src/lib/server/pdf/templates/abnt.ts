/**
 * Simplified ABNT NBR 14724 academic work.
 *
 * Implements the typographic rules that carry the most weight in practice
 * with a clear split between capa (cover) and folha de rosto (title page)
 * as the spec prescribes.
 *
 * Pre-textual (ordered):
 *
 *   - Capa                  — instituição, autor, título, cidade, ano
 *   - Folha de rosto        — + natureza, orientador
 *   - Dedicatória           — optional, right-aligned bottom
 *   - Agradecimentos        — optional
 *   - Resumo + palavras-chave
 *   - Abstract + keywords
 *   - Sumário (auto from TOC)
 *
 * Textual: body with 1 / 1.1 / 1.1.1 heading tier.
 *
 * Post-textual: APÊNDICEs are just markdown headings written as
 * "# APÊNDICE A — Título" and styled by the template (new page, centered
 * heading, no numbering).
 *
 *   ```yaml
 *   template: abnt
 *   abnt:
 *     instituicao: Universidade Federal de Exemplo
 *     curso: Ciência da Computação
 *     autor: Ana Silva
 *     natureza: |
 *       Trabalho de Conclusão de Curso apresentado …
 *     orientador: Prof. Dr. João Santos
 *     cidade: São Paulo
 *     ano: "2026"
 *     dedicatoria: |
 *       Aos meus pais, pelo apoio incondicional.
 *     agradecimentos: |
 *       Agradeço ao Prof. Dr. João Santos pela orientação dedicada.
 *     resumo: |
 *       Este trabalho …
 *     palavrasChave: [dados, infraestrutura]
 *     abstract: |
 *       This work …
 *     keywords: [data, infrastructure]
 *   ```
 */

import { INTER_CSS, KATEX_CSS, needsKatex, needsMermaid } from '../shared';
import mermaidScript from 'mermaid/dist/mermaid.min.js?raw';
import type { RenderContext, Template, TocEntry } from '../templates';
import { asString, asStringArray } from '../academic';
import { abntStyle, parseReferences, processCitations, stripReferencesHeading } from '../citations';

interface AbntOptions {
	instituicao?: string;
	curso?: string;
	autor?: string;
	natureza?: string;
	orientador?: string;
	cidade?: string;
	ano?: string;
	dedicatoria?: string;
	agradecimentos?: string;
	resumo?: string;
	abstract?: string;
	palavrasChave?: string[];
	keywords?: string[];
	/**
	 * 'times' (default) or 'arial'. NBR 14724 is silent on font choice —
	 * only that the face must be legible and used consistently — but in
	 * practice Brazilian examining boards accept only these two without
	 * discussion.
	 */
	font?: 'times' | 'arial';
}

function readOptions(raw: Record<string, unknown>): AbntOptions {
	const rawFont = asString(raw.font)?.toLowerCase();
	const font: 'times' | 'arial' | undefined =
		rawFont === 'arial' ? 'arial' : rawFont === 'times' ? 'times' : undefined;
	return {
		instituicao: asString(raw.instituicao),
		curso: asString(raw.curso),
		autor: asString(raw.autor),
		natureza: asString(raw.natureza),
		orientador: asString(raw.orientador),
		cidade: asString(raw.cidade),
		ano: asString(raw.ano),
		dedicatoria: asString(raw.dedicatoria),
		agradecimentos: asString(raw.agradecimentos),
		resumo: asString(raw.resumo),
		abstract: asString(raw.abstract),
		palavrasChave: asStringArray(raw.palavrasChave),
		keywords: asStringArray(raw.keywords),
		font
	};
}

function fontFamilyFor(choice: 'times' | 'arial' | undefined): string {
	if (choice === 'arial') return "Arial, 'Liberation Sans', sans-serif";
	return "'Times New Roman', Times, 'Liberation Serif', serif";
}

// CSS is generated per-render so the font-family token follows the
// author's choice. Two references to the family are swapped: the @page
// @top-right margin box (running page number) and the html root font.
// Everything else inherits.
function buildCss(fontChoice: 'times' | 'arial' | undefined): string {
	const family = fontFamilyFor(fontChoice);
	return `
/* ── Page geometry — ABNT spec is 3cm top/left, 2cm bottom/right ── */
@page {
	size: A4;
	margin: 3cm 2cm 2cm 3cm;
	@top-right {
		content: counter(page);
		font-family: ${family};
		font-size: 10pt;
	}
}

/* Pre-textual pages (capa, folha de rosto, dedicatória, etc.) are counted
   but unnumbered per NBR 14724. The numbered page counter keeps advancing
   so the textual section shows the correct absolute page number. */
@page abnt-pre {
	@top-right { content: none; }
}

.abnt-capa,
.abnt-rosto,
.abnt-pre { page: abnt-pre; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
	font-family: ${family};
	font-size: 12pt;
	line-height: 1.5;
	color: #000;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
}

body { margin: 0; padding: 0; }

/* ══════════════════════════════════════════════════════════════════════
   CAPA — instituição, autor, título, cidade, ano only. Per NBR 14724:
   instituição topo, autor abaixo, título centralizado na mancha,
   cidade/ano fixos no rodapé. Todos centralizados, caixa alta, negrito.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-capa {
	height: calc(297mm - 3cm - 2cm);
	display: grid;
	grid-template-rows: auto auto 1fr auto;
	text-align: center;
	break-after: page;
	font-weight: 700;
	text-transform: uppercase;
}

.abnt-capa .cap-inst {
	font-size: 12pt;
	line-height: 1.4;
}

.abnt-capa .cap-autor {
	font-size: 12pt;
	line-height: 1.4;
	margin-top: 8em;
}

.abnt-capa .cap-title {
	align-self: center;
	font-size: 14pt;
	line-height: 1.5;
	max-width: 13cm;
	margin: 0 auto;
	text-wrap: balance;
}

.abnt-capa .cap-foot {
	font-size: 12pt;
	line-height: 1.4;
}

.abnt-capa .cap-foot .cidade { margin-bottom: 0.2em; }

/* ══════════════════════════════════════════════════════════════════════
   FOLHA DE ROSTO — same as capa plus curso (abaixo da instituição),
   natureza do trabalho recuada ao lado direito da mancha, orientador
   junto à natureza.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-rosto {
	height: calc(297mm - 3cm - 2cm);
	display: grid;
	grid-template-rows: auto auto 1fr auto;
	text-align: center;
	break-after: page;
	font-weight: 700;
	text-transform: uppercase;
}

.abnt-rosto .ros-top {
	font-size: 12pt;
	line-height: 1.4;
}

.abnt-rosto .ros-autor {
	font-size: 12pt;
	line-height: 1.4;
	margin-top: 6em;
}

.abnt-rosto .ros-middle {
	align-self: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 3.5em;
	max-width: 15cm;
	margin: 0 auto;
}

.abnt-rosto .ros-title {
	font-size: 14pt;
	line-height: 1.5;
	max-width: 13cm;
	text-wrap: balance;
}

/* Natureza: right half of the text block, left-aligned, no caixa alta,
   single line spacing, slightly smaller. */
.abnt-rosto .ros-natureza {
	margin-left: 8cm;
	font-size: 10pt;
	line-height: 1.2;
	text-align: justify;
	font-weight: 400;
	text-transform: none;
	align-self: flex-start;
}

.abnt-rosto .ros-natureza .orient {
	margin-top: 1em;
}

.abnt-rosto .ros-foot {
	font-size: 12pt;
	line-height: 1.4;
}

.abnt-rosto .ros-foot .cidade { margin-bottom: 0.2em; }

/* ══════════════════════════════════════════════════════════════════════
   Dedicatória e Agradecimentos — páginas pré-textuais opcionais. A
   dedicatória não leva cabeçalho e o texto fica recuado à direita no
   terço inferior; agradecimentos leva "AGRADECIMENTOS" centralizado.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-dedicatoria {
	page: abnt-pre;
	break-after: page;
	height: calc(297mm - 3cm - 2cm);
	display: flex;
	flex-direction: column;
	justify-content: flex-end;
	padding-bottom: 4em;
}

.abnt-dedicatoria .ded-text {
	margin-left: 8cm;
	font-style: italic;
	line-height: 1.5;
	text-align: justify;
}

.abnt-agradecimentos {
	page: abnt-pre;
	break-after: page;
}

.abnt-agradecimentos h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-agradecimentos p {
	text-align: justify;
	text-indent: 1.25cm;
	margin-bottom: 0.2em;
}

/* ══════════════════════════════════════════════════════════════════════
   Pre-textual text blocks (resumo, abstract) — centered heading no
   numbering, justified body, palavras-chave trailing after a blank line.
   ═══════════════════════════════════════════════════════════════════ */
.abnt-pre {
	break-before: page;
	break-after: page;
}

.abnt-pre h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-pre p {
	text-align: justify;
	text-indent: 1.25cm;
	margin-bottom: 0;
}

.abnt-pre .palavras-chave,
.abnt-pre .keywords {
	margin-top: 1.5em;
	text-indent: 0;
	text-align: justify;
}

.abnt-pre .palavras-chave strong,
.abnt-pre .keywords strong { font-weight: 700; }

/* ── Sumário ── */
.abnt-sumario {
	break-after: page;
	page: abnt-pre;
}

.abnt-sumario h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	text-align: center;
	margin-bottom: 1.5em;
}

.abnt-sumario ol {
	list-style: none;
	padding: 0;
	margin: 0;
}

.abnt-sumario li {
	display: flex;
	align-items: baseline;
	gap: 4mm;
	padding: 1.5mm 0;
	font-size: 12pt;
}

.abnt-sumario li.toc-level-1 { font-weight: 700; text-transform: uppercase; padding-top: 3mm; }
.abnt-sumario li.toc-level-2 { padding-left: 10mm; }
.abnt-sumario li.toc-level-3 { padding-left: 20mm; font-style: italic; }
.abnt-sumario li.toc-level-4 { padding-left: 30mm; font-style: italic; }

.abnt-sumario .toc-text { flex: 1; }
.abnt-sumario .toc-fill {
	flex: 1;
	border-bottom: 1px dotted #000;
	margin: 0 2mm 2mm;
	min-width: 4mm;
}
.abnt-sumario .toc-pg {
	min-width: 8mm;
	text-align: right;
}

/* ══════════════════════════════════════════════════════════════════════
   Textual body — NBR 6024: primary bold uppercase, secondary bold mixed
   case, tertiary italic bold, quaternary italic non-bold.
   ═══════════════════════════════════════════════════════════════════ */

.abnt-body h1 {
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	margin: 0 0 1.5em;
	break-before: page;
	break-after: avoid;
}

/* The first h1 already sits at the start of the textual section because
   the container starts a new page — no extra break needed. */
.abnt-body > h1:first-child { break-before: auto; }

.abnt-body h2 {
	font-size: 12pt;
	font-weight: 700;
	margin: 2em 0 1em;
	break-after: avoid;
}

.abnt-body h3 {
	font-size: 12pt;
	font-style: italic;
	font-weight: 700;
	margin: 1.6em 0 0.8em;
	break-after: avoid;
}

.abnt-body h4 {
	font-size: 12pt;
	font-style: italic;
	font-weight: 400;
	margin: 1.3em 0 0.5em;
	break-after: avoid;
}

.abnt-body p {
	text-indent: 1.25cm;
	text-align: justify;
	margin: 0 0 0.3em;
	hyphens: auto;
}

.abnt-body h1 + p,
.abnt-body h2 + p,
.abnt-body h3 + p,
.abnt-body h4 + p,
.abnt-body blockquote + p,
.abnt-body pre + p,
.abnt-body table + p,
.abnt-body figure + p,
.abnt-body ul + p,
.abnt-body ol + p { text-indent: 0; }

.abnt-body ul,
.abnt-body ol {
	margin: 0.5em 0 0.5em 1.25cm;
	padding-left: 1cm;
}

.abnt-body li { margin-bottom: 2mm; }

/* Long direct quotations — NBR 10520: quotes longer than 3 lines indent
   4cm, single line-spacing, smaller font, no italic. */
.abnt-body blockquote {
	margin: 1em 0 1em 4cm;
	font-size: 10pt;
	line-height: 1.0;
	text-align: justify;
}

.abnt-body blockquote p { text-indent: 0; }

/* Inline code — monospace to distinguish it from prose (ABNT follows
   the same convention as IEEE/ACM), but no pill. Courier at 11pt reads
   close to the 12pt Times body so the line isn't visually disrupted. */
.abnt-body :not(pre) > code {
	font-family: 'Courier New', Courier, monospace;
	font-size: 11pt;
	background: transparent;
	padding: 0;
	border: 0;
}

.abnt-body pre {
	font-family: 'Courier New', Courier, monospace;
	font-size: 10pt;
	line-height: 1.2;
	background: #f5f3ee;
	border: 0.5pt solid #000;
	padding: 2mm 3mm;
	margin: 1em 0;
	overflow: hidden;
}

/* Tables — NBR 14724 says caption on top, source below.
   We emit plain markdown tables; captions come from author markdown. */
.abnt-body table {
	width: 100%;
	border-collapse: collapse;
	margin: 1em 0;
	font-size: 10pt;
	break-inside: avoid;
}

.abnt-body table caption {
	caption-side: top;
	font-size: 10pt;
	text-align: left;
	margin-bottom: 2mm;
	font-weight: 400;
}

.abnt-body th {
	border-top: 0.75pt solid #000;
	border-bottom: 0.5pt solid #000;
	text-align: left;
	padding: 1mm 2mm;
	font-weight: 700;
}

.abnt-body td {
	padding: 1mm 2mm;
	border-bottom: 0.25pt solid #000;
	vertical-align: top;
}

.abnt-body tr:last-child td { border-bottom: 0.75pt solid #000; }

/* Figures — caption ABOVE per NBR 14724. Source is free text authors
   place below the image in markdown. */
.abnt-body figure {
	margin: 1em 0;
	text-align: center;
	break-inside: avoid;
	display: flex;
	flex-direction: column;
}

.abnt-body figure img {
	max-width: 100%;
	height: auto;
	order: 2;
}

.abnt-body figcaption {
	order: 1;
	font-size: 10pt;
	text-align: center;
	margin-bottom: 2mm;
}

.abnt-body a { color: #000; text-decoration: underline; }

/* References — "Referências" as centered uppercase heading, entries
   left-aligned, single-line, double space between entries. */
.abnt-body h1.references-heading,
.abnt-body h2.references-heading {
	text-transform: uppercase;
	text-align: center;
	margin: 2em 0 1em;
	break-before: page;
}

.abnt-body ol.references-list,
.abnt-body ul.references-list {
	list-style: none;
	padding-left: 0;
	margin-left: 0;
}

.abnt-body ol.references-list li,
.abnt-body ul.references-list li {
	text-indent: 0;
	text-align: left;
	line-height: 1.0;
	margin-bottom: 1em;
	hyphens: none;
}

/* APÊNDICE headings — markdown convention "# APÊNDICE A — Título".
   The template detects by text content in postprocessing and styles
   them with a fresh page, centered, no automatic numbering. */
.abnt-body .apendice-heading {
	text-align: center;
	font-size: 12pt;
	font-weight: 700;
	text-transform: uppercase;
	margin: 0 0 2em;
	break-before: page;
	break-after: avoid;
}
`;
}

function buildCapa(opts: AbntOptions, meta: RenderContext['meta']): string {
	const instituicao = opts.instituicao ?? '';
	const autor = opts.autor ?? (Array.isArray(meta.author) ? meta.author[0] : meta.author) ?? '';
	const cidade = opts.cidade ?? '';
	const ano = opts.ano ?? (meta.date ? new Date(meta.date).getFullYear().toString() : '');

	return `
<section class="abnt-capa">
	<div class="cap-inst">${instituicao}</div>
	<div class="cap-autor">${autor}</div>
	<h1 class="cap-title">${meta.title}</h1>
	<div class="cap-foot">
		${cidade ? `<div class="cidade">${cidade}</div>` : ''}
		${ano ? `<div class="ano">${ano}</div>` : ''}
	</div>
</section>`;
}

function buildFolhaDeRosto(opts: AbntOptions, meta: RenderContext['meta']): string {
	const instituicao = opts.instituicao ?? '';
	const curso = opts.curso ?? '';
	const autor = opts.autor ?? (Array.isArray(meta.author) ? meta.author[0] : meta.author) ?? '';
	const cidade = opts.cidade ?? '';
	const ano = opts.ano ?? (meta.date ? new Date(meta.date).getFullYear().toString() : '');

	const naturezaBlock = opts.natureza
		? `<div class="ros-natureza">
			${opts.natureza.replace(/\n/g, '<br/>')}
			${opts.orientador ? `<div class="orient">Orientador: ${opts.orientador}</div>` : ''}
		</div>`
		: opts.orientador
			? `<div class="ros-natureza"><div class="orient">Orientador: ${opts.orientador}</div></div>`
			: '';

	return `
<section class="abnt-rosto">
	<div class="ros-top">
		${instituicao ? `<div>${instituicao}</div>` : ''}
		${curso ? `<div>${curso}</div>` : ''}
	</div>
	<div class="ros-autor">${autor}</div>
	<div class="ros-middle">
		<h1 class="ros-title">${meta.title}</h1>
		${naturezaBlock}
	</div>
	<div class="ros-foot">
		${cidade ? `<div class="cidade">${cidade}</div>` : ''}
		${ano ? `<div class="ano">${ano}</div>` : ''}
	</div>
</section>`;
}

function buildDedicatoria(opts: AbntOptions): string {
	if (!opts.dedicatoria) return '';
	return `
<section class="abnt-dedicatoria">
	<div class="ded-text">${opts.dedicatoria.replace(/\n\n+/g, '</div><div class="ded-text">')}</div>
</section>`;
}

function buildAgradecimentos(opts: AbntOptions): string {
	if (!opts.agradecimentos) return '';
	return `
<section class="abnt-agradecimentos">
	<h1>Agradecimentos</h1>
	<p>${opts.agradecimentos.replace(/\n\n+/g, '</p><p>')}</p>
</section>`;
}

function buildPreTextual(opts: AbntOptions): string {
	const parts: string[] = [];

	if (opts.resumo) {
		parts.push(`
<section class="abnt-pre">
	<h1>Resumo</h1>
	<p>${opts.resumo.replace(/\n\n+/g, '</p><p>')}</p>
	${opts.palavrasChave && opts.palavrasChave.length > 0
		? `<p class="palavras-chave"><strong>Palavras-chave:</strong> ${opts.palavrasChave.join('; ')}.</p>`
		: ''}
</section>`);
	}

	if (opts.abstract) {
		parts.push(`
<section class="abnt-pre">
	<h1>Abstract</h1>
	<p>${opts.abstract.replace(/\n\n+/g, '</p><p>')}</p>
	${opts.keywords && opts.keywords.length > 0
		? `<p class="keywords"><strong>Keywords:</strong> ${opts.keywords.join('; ')}.</p>`
		: ''}
</section>`);
	}

	return parts.join('\n');
}

function buildSumario(toc: TocEntry[]): string {
	if (toc.length <= 2) return '';
	// Section numbers live in the heading text itself ("1 Introdução",
	// "1.1 Contexto"), so the sumário only needs to show the text and the
	// page number — no separate numeric column.
	return `
<section class="abnt-sumario">
	<h1>Sumário</h1>
	<ol>
		${toc.map((e) => `<li class="toc-level-${e.level}" data-toc-id="${e.id}">
			<span class="toc-text">${e.text}</span>
			<span class="toc-fill"></span>
			<span class="toc-pg">—</span>
		</li>`).join('\n')}
	</ol>
</section>`;
}

/**
 * Tag headings whose text starts with "APÊNDICE" or "ANEXO" so the CSS
 * can apply the post-textual treatment (new page, centered, no numbering).
 * Markdown-convention based — authors write "# APÊNDICE A — Título".
 */
function markApendices(bodyHtml: string): string {
	return bodyHtml.replace(
		/<h([1-3])([^>]*)>(AP[EÊ]NDICE|ANEXO)([^<]*)<\/h[1-3]>/gi,
		'<h$1$2 class="apendice-heading">$3$4</h$1>'
	);
}

async function buildHtml(ctx: RenderContext): Promise<string> {
	const opts = readOptions(ctx.options);
	const capa = buildCapa(opts, ctx.meta);
	const rosto = buildFolhaDeRosto(opts, ctx.meta);
	const dedicatoria = buildDedicatoria(opts);
	const agradecimentos = buildAgradecimentos(opts);
	const preTextual = buildPreTextual(opts);
	const sumario = buildSumario(ctx.toc);

	// Citations — if references were declared, scan body for [@key] tokens
	// and emit a formatted references section. Otherwise honor a hand-written
	// references section as-is.
	const references = parseReferences(ctx.options.references);
	const cite = processCitations(ctx.bodyHtml, references, abntStyle);
	const bodyWithCites = cite.hasCitations ? stripReferencesHeading(cite.body) : cite.body;
	const body = markApendices(bodyWithCites);
	const refsSection = cite.hasCitations ? cite.referencesHtml : '';

	const mermaidNeeded = needsMermaid(ctx.bodyHtml);
	const katexNeeded = needsKatex(ctx.bodyHtml);

	const mermaidTags = mermaidNeeded
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

	const katexTag = katexNeeded ? `<style>${KATEX_CSS}</style>` : '';

	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${ctx.meta.title}</title>
<style>${INTER_CSS}</style>
${katexTag}
<style>${buildCss(opts.font)}</style>
${mermaidTags}
</head>
<body>
${capa}
${rosto}
${dedicatoria}
${agradecimentos}
${preTextual}
${sumario}
<div class="abnt-body">
${body}
${refsSection}
</div>
</body>
</html>`;
}

/**
 * Count the pages rendered before the textual body. Capa + folha de rosto
 * are always emitted; the rest depend on which options the author filled
 * in. This feeds the TOC page-number patch in index.ts so the sumário
 * shows the right page for each heading.
 */
function abntPreTextualPages(ctx: RenderContext): number {
	const opts = readOptions(ctx.options);
	let count = 2; // capa + folha de rosto
	if (opts.dedicatoria) count += 1;
	if (opts.agradecimentos) count += 1;
	if (opts.resumo) count += 1;
	if (opts.abstract) count += 1;
	if (ctx.toc.length > 2) count += 1; // sumário
	return count;
}

export const abnt: Template = {
	id: 'abnt',
	label: 'ABNT — Trabalho Acadêmico',
	buildFull: buildHtml,
	preTextualPages: abntPreTextualPages
};
