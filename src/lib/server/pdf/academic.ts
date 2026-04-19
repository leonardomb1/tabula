/**
 * Shared helpers for the sci-paper templates (ACM + IEEE). Both render a
 * two-column body with a title block + authors + affiliations, an abstract
 * that spans both columns at the top, and a references section at the
 * bottom. The typographic details (font, size, heading style) differ per
 * template — passed in via `theme` and consumed by the CSS emitted here.
 *
 * Authors are parsed permissively — YAML can express either a plain string,
 * a string array, or an array of objects with name/affiliation/email.
 * Everything normalizes to an Author[] so templates can handle one code path.
 */

export interface Author {
	name: string;
	affiliation?: string;
	email?: string;
}

/** Accept any of: "Alice", ["Alice", "Bob"], [{ name: "Alice", ... }] */
export function normalizeAuthors(raw: unknown): Author[] {
	if (!raw) return [];
	if (typeof raw === 'string') return [{ name: raw }];
	if (!Array.isArray(raw)) return [];
	return raw.flatMap((entry): Author[] => {
		if (typeof entry === 'string') return [{ name: entry }];
		if (entry && typeof entry === 'object') {
			const a = entry as Record<string, unknown>;
			if (typeof a.name !== 'string') return [];
			return [{
				name: a.name,
				affiliation: typeof a.affiliation === 'string' ? a.affiliation : undefined,
				email: typeof a.email === 'string' ? a.email : undefined
			}];
		}
		return [];
	});
}

export function asString(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

export function asStringArray(v: unknown): string[] {
	if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
	return [];
}

// ── Title-block renderers ─────────────────────────────────────────────────
// Both ACM and IEEE put the title block above the two-column body. They
// differ in spacing and typography but share the "title, authors inline
// with superscript markers, affiliations listed below" pattern.

export function renderAuthors(authors: Author[]): string {
	if (authors.length === 0) return '';

	// Distinct affiliations → numbered superscripts. Authors with the same
	// affiliation share the same number; authors without one get no marker.
	const affList: string[] = [];
	const affIndex = new Map<string, number>();
	for (const a of authors) {
		if (!a.affiliation) continue;
		if (!affIndex.has(a.affiliation)) {
			affIndex.set(a.affiliation, affList.length + 1);
			affList.push(a.affiliation);
		}
	}

	const authorSpans = authors.map((a) => {
		const marker = a.affiliation ? `<sup>${affIndex.get(a.affiliation)}</sup>` : '';
		return `<span class="author">${a.name}${marker}</span>`;
	}).join(', ');

	const affs = affList.length > 0
		? `<div class="affiliations">${
			affList.map((aff, i) =>
				`<div class="affiliation"><sup>${i + 1}</sup> ${aff}</div>`
			).join('')
		}</div>`
		: '';

	const emails = authors
		.filter((a) => a.email)
		.map((a) => `<a href="mailto:${a.email}">${a.email}</a>`)
		.join(', ');
	const emailsBlock = emails
		? `<div class="emails">${emails}</div>`
		: '';

	return `
<div class="authors-line">${authorSpans}</div>
${affs}
${emailsBlock}`;
}

export function renderAbstract(abstract: string | undefined, keywordsLabel: string, keywords: string[]): string {
	if (!abstract && keywords.length === 0) return '';
	return `
<section class="abstract">
	${abstract ? `<h2 class="abstract-heading">Abstract</h2><p>${abstract}</p>` : ''}
	${keywords.length > 0 ? `<p class="keywords"><strong>${keywordsLabel}:</strong> ${keywords.join(', ')}</p>` : ''}
</section>`;
}

/**
 * CSS shared between ACM + IEEE. Everything that differs (font family, sizes,
 * heading conventions) is template-local. This is just the layout scaffold:
 * page geometry, two-column body, title-block spanning behavior.
 *
 * Template-provided CSS vars — each template sets these before emitting this
 * block so the same rules scale up/down:
 *   --paper-font       — body font stack
 *   --paper-display-font — title font (same as paper-font for IEEE, serif for ACM)
 *   --paper-size       — body font-size (pt)
 *   --paper-leading    — body line-height (unitless)
 *   --paper-title-size — title font-size (pt)
 *   --paper-col-gap    — gutter between columns (mm)
 *   --paper-margin     — @page margin (shorthand, e.g. "18mm")
 */
export const ACADEMIC_CSS = `
@page {
	size: A4;
	margin: var(--paper-margin);
	@bottom-right {
		content: counter(page);
		font-family: var(--paper-font);
		font-size: 8pt;
		color: #888;
	}
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
	font-family: var(--paper-font);
	font-size: var(--paper-size);
	line-height: var(--paper-leading);
	color: #111;
	-webkit-print-color-adjust: exact;
	print-color-adjust: exact;
	text-rendering: optimizeLegibility;
}

body { margin: 0; padding: 0; }

/* ── Title block (spans full width, above columns) ── */
.paper-title-block {
	margin: 0 0 10mm;
	text-align: center;
}

.paper-title-block .paper-title {
	font-family: var(--paper-display-font);
	font-size: var(--paper-title-size);
	font-weight: 700;
	line-height: 1.15;
	margin: 0 0 4mm;
	text-wrap: balance;
}

.paper-title-block .authors-line {
	font-family: var(--paper-font);
	font-size: calc(var(--paper-size) + 1pt);
	margin-bottom: 3mm;
}

.paper-title-block .author { margin: 0 0.25em; }
.paper-title-block .author sup { font-size: 0.7em; vertical-align: super; }

.paper-title-block .affiliations {
	font-size: calc(var(--paper-size) - 1pt);
	color: #333;
	font-style: italic;
	line-height: 1.4;
}

.paper-title-block .affiliation {
	display: inline-block;
	margin: 0 1em;
}

.paper-title-block .affiliation sup {
	font-size: 0.8em;
	font-style: normal;
	vertical-align: super;
	margin-right: 2px;
}

.paper-title-block .emails {
	font-family: ui-monospace, Consolas, monospace;
	font-size: calc(var(--paper-size) - 1.5pt);
	color: #555;
	margin-top: 2mm;
}

/* ── Abstract (spans full width) ── */
.abstract {
	margin: 0 8mm 8mm;
	padding: 3mm 5mm;
	border-top: 0.5pt solid #000;
	border-bottom: 0.5pt solid #000;
}

.abstract .abstract-heading {
	font-family: var(--paper-display-font);
	font-size: calc(var(--paper-size) + 0.5pt);
	font-weight: 700;
	text-align: center;
	margin: 0 0 2mm;
}

.abstract p {
	font-size: calc(var(--paper-size) - 0.5pt);
	line-height: 1.4;
	text-align: justify;
	margin: 0 0 2mm;
}

.abstract .keywords {
	font-size: calc(var(--paper-size) - 0.5pt);
	margin-top: 3mm;
	text-align: justify;
}

/* ── Two-column body ── */
.paper-body {
	column-count: 2;
	column-gap: var(--paper-col-gap);
	column-fill: balance;
}

.paper-body > *:first-child { margin-top: 0; }

.paper-body p {
	text-align: justify;
	hyphens: auto;
	margin: 0 0 2mm;
	text-indent: 4mm;
}

.paper-body p:first-of-type,
.paper-body h1 + p,
.paper-body h2 + p,
.paper-body h3 + p,
.paper-body h4 + p,
.paper-body blockquote + p,
.paper-body pre + p,
.paper-body table + p,
.paper-body ul + p,
.paper-body ol + p {
	text-indent: 0;
}

/* Lists */
.paper-body ul, .paper-body ol {
	padding-left: 5mm;
	margin: 0 0 2mm;
}

.paper-body li { margin-bottom: 0.8mm; }

/* Inline code — monospace to distinguish it from prose (IEEE / ACM
   convention), but no background pill or border. The typeface shift
   alone carries the distinction; the pill is a web idiom that reads as
   ornamental in print. */
.paper-body :not(pre) > code {
	font-family: 'Courier New', Courier, ui-monospace, monospace;
	font-size: 0.92em;
	background: transparent;
	padding: 0;
	border: 0;
}

/* Code block — sits in one column, breaks inside are allowed */
.paper-body pre {
	font-family: ui-monospace, Consolas, monospace;
	font-size: calc(var(--paper-size) - 1.5pt);
	line-height: 1.45;
	background: #f5f3ee;
	border: 0.5pt solid #d8d4c8;
	border-radius: 2pt;
	padding: 2mm 3mm;
	margin: 2mm 0;
	overflow: hidden;
}

/* Tables — narrow, tight, academic */
.paper-body table {
	width: 100%;
	border-collapse: collapse;
	font-size: calc(var(--paper-size) - 1pt);
	margin: 3mm 0;
	break-inside: avoid;
}

.paper-body table caption {
	caption-side: top;
	text-align: left;
	font-size: calc(var(--paper-size) - 1pt);
	font-style: italic;
	margin-bottom: 1mm;
}

.paper-body th {
	text-align: left;
	border-top: 0.75pt solid #000;
	border-bottom: 0.5pt solid #000;
	padding: 1mm 2mm;
	font-weight: 600;
}

.paper-body td {
	padding: 0.8mm 2mm;
	border-bottom: 0.25pt solid #999;
	vertical-align: top;
}

.paper-body tr:last-child td { border-bottom: 0.75pt solid #000; }

/* Figures */
.paper-body figure {
	margin: 3mm 0;
	text-align: center;
	break-inside: avoid;
}

.paper-body figure img { max-width: 100%; height: auto; }

.paper-body figcaption {
	font-size: calc(var(--paper-size) - 1pt);
	font-style: italic;
	margin-top: 1mm;
	text-align: left;
}

/* Blockquote — indented, small */
.paper-body blockquote {
	margin: 2mm 3mm;
	font-size: calc(var(--paper-size) - 0.5pt);
	font-style: italic;
	color: #333;
}

/* References */
.references {
	column-count: 2;
	column-gap: var(--paper-col-gap);
	font-size: calc(var(--paper-size) - 1.5pt);
	line-height: 1.35;
	margin-top: 6mm;
}

.references-heading {
	column-span: all;
	font-family: var(--paper-display-font);
	font-size: calc(var(--paper-size) + 0.5pt);
	font-weight: 700;
	margin: 4mm 0 3mm;
}

.references ol, .references ul {
	padding-left: 5mm;
	margin: 0;
}

.references li {
	margin-bottom: 1.5mm;
	break-inside: avoid;
	text-align: justify;
	hyphens: auto;
}
`;

/**
 * Extract a trailing `## References` / `## Referências` section from the
 * rendered body HTML, returning the pre-references body + the references
 * HTML separately. Templates emit the references section as a full-width
 * block below the two-column body so its own columns can balance.
 *
 * Matches the generated heading IDs from renderer.heading (`references`,
 * `referências` — accent-stripped in the current slug implementation).
 */
export function splitReferences(bodyHtml: string): { body: string; references: string | null } {
	const re = /<h2[^>]*id="(references|referencias|bibliography|bibliografia)"[^>]*>[\s\S]*$/i;
	const m = re.exec(bodyHtml);
	if (!m) return { body: bodyHtml, references: null };
	return {
		body: bodyHtml.slice(0, m.index),
		references: bodyHtml.slice(m.index)
	};
}
