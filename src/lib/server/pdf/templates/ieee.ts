/**
 * IEEE-style academic paper. Double-column, Times-flavored serif, 9pt body,
 * Roman-numeral section headings in small caps ("I. INTRODUCTION").
 *
 * Styling-only — numbering is the author's responsibility. The template
 * encourages the IEEE look; it doesn't auto-renumber markdown headings.
 *
 *   ```yaml
 *   template: ieee
 *   ieee:
 *     authors:
 *       - { name: Alice Chen, affiliation: "Dept. of CS, MIT", email: alice@mit.edu }
 *     abstract: |
 *       This paper describes …
 *     keywords: [scheduling, consistency]
 *   ```
 */

import { INTER_CSS, KATEX_CSS, needsKatex, needsMermaid } from '../shared';
import mermaidScript from 'mermaid/dist/mermaid.min.js?raw';
import type { RenderContext, Template } from '../templates';
import {
	ACADEMIC_CSS,
	asString,
	asStringArray,
	normalizeAuthors,
	renderAbstract,
	renderAuthors,
	splitReferences
} from '../academic';
import { ieeeStyle, parseReferences, processCitations, stripReferencesHeading } from '../citations';

interface IeeeOptions {
	authors?: unknown;
	abstract?: string;
	keywords?: string[];
}

function readOptions(raw: Record<string, unknown>): IeeeOptions {
	return {
		authors: raw.authors,
		abstract: asString(raw.abstract),
		keywords: asStringArray(raw.keywords)
	};
}

// IEEE spec: Times New Roman 10pt body, 26pt title, 9pt references. The
// class file targets Computer Modern but the published guidance for
// MS-Word-based authors is explicitly Times New Roman, which we follow.
const IEEE_LOCAL_CSS = `
:root {
	--paper-font: 'Times New Roman', Times, 'Liberation Serif', serif;
	--paper-display-font: 'Times New Roman', Times, 'Liberation Serif', serif;
	--paper-size: 10pt;
	--paper-leading: 1.18;
	--paper-title-size: 26pt;
	--paper-col-gap: 5mm;
	--paper-margin: 17mm 15mm 22mm 15mm;
}

/* Title block tweaks — IEEE titles are larger and authors sit tight below. */
.paper-title-block .paper-title {
	font-weight: 400;
	letter-spacing: -0.01em;
}

/* Abstract: IEEE puts the heading on the same line as the first sentence
   (".Abstract—"). We approximate with bold inline text. */
.abstract {
	border: none;
	margin: 0 0 6mm;
	padding: 0 6mm;
}

.abstract .abstract-heading {
	display: inline;
	font-size: 9pt;
	font-weight: 700;
	font-style: italic;
	margin: 0 0.4em 0 0;
	text-align: left;
}

.abstract .abstract-heading::after { content: "—"; margin-left: 0.1em; }

.abstract p {
	display: inline;
	text-align: justify;
}

.abstract .keywords {
	display: block;
	margin-top: 3mm;
	font-size: 9pt;
}

.abstract .keywords strong {
	font-style: italic;
	font-weight: 700;
}

/* Section headings — Roman numeral small caps. Authors write
   "## I. Introduction" in markdown and the template styles it here. */
.paper-body h1,
.paper-body h2 {
	font-family: var(--paper-display-font);
	font-size: 10pt;
	font-weight: 400;
	text-transform: uppercase;
	letter-spacing: 0.02em;
	text-align: center;
	margin: 4mm 0 1.5mm;
	break-after: avoid;
}

.paper-body h3 {
	font-family: var(--paper-display-font);
	font-size: 10pt;
	font-weight: 400;
	font-style: italic;
	text-align: left;
	margin: 3mm 0 1mm;
	break-after: avoid;
}

.paper-body h4 {
	font-family: var(--paper-display-font);
	font-size: 10pt;
	font-style: italic;
	margin: 2mm 0 0.8mm;
	text-align: left;
	break-after: avoid;
}

.paper-body a { color: #000; text-decoration: none; }

/* References: small, numbered list with tight leading */
.references-heading {
	text-align: center;
	text-transform: uppercase;
	letter-spacing: 0.02em;
	font-size: 10pt;
	font-weight: 400;
}

.references {
	font-size: 9pt;
	line-height: 1.3;
}

.references ol {
	list-style: none;
	padding-left: 0;
	counter-reset: ieeeref;
}

.references ol li {
	counter-increment: ieeeref;
	position: relative;
	padding-left: 8mm;
	margin-bottom: 1.2mm;
}

.references ol li::before {
	content: "[" counter(ieeeref) "]";
	position: absolute;
	left: 0;
	font-weight: 400;
}
`;

async function buildHtml(ctx: RenderContext): Promise<string> {
	const opts = readOptions(ctx.options);
	const authors = normalizeAuthors(opts.authors ?? ctx.meta.author);

	const references = parseReferences(ctx.options.references);
	const cite = processCitations(ctx.bodyHtml, references, ieeeStyle);
	const bodyHtml = cite.hasCitations ? stripReferencesHeading(cite.body) : cite.body;
	const { body, references: manualRefs } = cite.hasCitations
		? { body: bodyHtml, references: null }
		: splitReferences(bodyHtml);

	const titleBlock = `
<header class="paper-title-block">
	<h1 class="paper-title">${ctx.meta.title}</h1>
	${renderAuthors(authors)}
</header>`;

	const abstractBlock = renderAbstract(opts.abstract, 'Index Terms', opts.keywords ?? []);

	const autoRefs = cite.hasCitations
		? `<section class="references">
			<h2 class="references-heading">References</h2>
			${cite.referencesHtml.replace(/<section[^>]*>|<\/section>|<h2[^>]*>[\s\S]*?<\/h2>/g, '')}
		</section>`
		: '';

	const manualRefsBlock = manualRefs
		? `<section class="references">
			<h2 class="references-heading">References</h2>
			${manualRefs.replace(/<h2[^>]*id="(references|referencias|bibliography|bibliografia)"[^>]*>[^<]*<\/h2>/i, '')}
		</section>`
		: '';

	const refsBlock = autoRefs || manualRefsBlock;

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
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${ctx.meta.title}</title>
<style>${INTER_CSS}</style>
${katexTag}
<style>${IEEE_LOCAL_CSS} ${ACADEMIC_CSS}</style>
${mermaidTags}
</head>
<body>
${titleBlock}
${abstractBlock}
<div class="paper-body">
${body}
</div>
${refsBlock}
</body>
</html>`;
}

export const ieee: Template = {
	id: 'ieee',
	label: 'IEEE — Scientific Paper',
	buildFull: buildHtml
};
