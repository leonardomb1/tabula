/**
 * ACM-style academic paper. Double-column, Libertine-flavored serif, bold
 * arabic-numbered section headings (`1`, `1.1`, `1.1.1`).
 *
 * Styling-only — authors manage their own section/figure/reference numbering
 * in markdown. The template provides the look; cross-reference tooling isn't
 * in scope.
 *
 *   ```yaml
 *   template: acm
 *   acm:
 *     authors:
 *       - { name: Alice Chen, affiliation: MIT, email: alice@mit.edu }
 *       - { name: Bob Park, affiliation: Stanford }
 *     abstract: |
 *       We present …
 *     keywords: [scaling, distributed systems]
 *     venue: "ACM SIGMOD '26, Bangalore, India"
 *   ```
 */

import { INTER_CSS, KATEX_CSS, inlineFontFamily, needsKatex, needsMermaid } from '../shared';
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
import { acmStyle, parseReferences, processCitations, stripReferencesHeading } from '../citations';

interface AcmOptions {
	authors?: unknown;
	abstract?: string;
	keywords?: string[];
	venue?: string;
}

function readOptions(raw: Record<string, unknown>): AcmOptions {
	return {
		authors: raw.authors,
		abstract: asString(raw.abstract),
		keywords: asStringArray(raw.keywords),
		venue: asString(raw.venue)
	};
}

// ACM specifies Linux Libertine for its proceedings template — the spec
// even calls out that fonts must not be substituted. We ship Libertinus
// Serif, the actively-maintained drop-in that's bundled through
// @fontsource and inlined into the PDF so Puppeteer doesn't need CDN
// access. Cambria / Palatino Linotype are kept as fallback for offline
// builds where the node_modules font file might be missing.
const LIBERTINUS_CSS = inlineFontFamily(
	'Libertinus Serif',
	'@fontsource/libertinus-serif/files/libertinus-serif-latin',
	[
		[400, 'normal'],
		[400, 'italic'],
		[600, 'normal'],
		[600, 'italic'],
		[700, 'normal'],
		[700, 'italic']
	]
);

const ACM_LOCAL_CSS = `
${LIBERTINUS_CSS}

:root {
	--paper-font: 'Libertinus Serif', 'Linux Libertine', 'Cambria', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
	--paper-display-font: 'Libertinus Serif', 'Linux Libertine', 'Cambria', 'Palatino Linotype', Georgia, serif;
	--paper-size: 9pt;
	--paper-leading: 1.22;
	--paper-title-size: 18pt;
	--paper-col-gap: 6mm;
	--paper-margin: 19mm 16mm 22mm 16mm;
}

/* Venue strap at the very top of page 1 — italic, small, centered */
.paper-venue {
	font-family: var(--paper-font);
	font-size: 8pt;
	font-style: italic;
	text-align: center;
	color: #333;
	margin: 0 0 6mm;
}

/* ACM section heading conventions. Numbered, bold, sans-ish in ACM master
   but we stay with the serif to keep the single-font look classic. */
.paper-body h1,
.paper-body h2 {
	font-family: var(--paper-display-font);
	font-weight: 700;
	font-size: 11pt;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin: 4mm 0 1.5mm;
	break-after: avoid;
}

.paper-body h3 {
	font-family: var(--paper-display-font);
	font-weight: 700;
	font-size: 10pt;
	margin: 3mm 0 1mm;
	break-after: avoid;
}

.paper-body h4 {
	font-family: var(--paper-display-font);
	font-weight: 700;
	font-size: 9.5pt;
	font-style: italic;
	margin: 2.5mm 0 0.8mm;
	break-after: avoid;
}

/* Links — inline dark, no decoration */
.paper-body a { color: #1a1a6a; text-decoration: none; }
.paper-body a:hover { text-decoration: underline; }
`;

async function buildHtml(ctx: RenderContext): Promise<string> {
	const opts = readOptions(ctx.options);
	const authors = normalizeAuthors(opts.authors ?? ctx.meta.author);

	// Citations take precedence over any hand-written references section.
	// When a references map is declared, we run the processor and wrap its
	// output in the paper's two-column references layout; otherwise we fall
	// back to the existing "split out the trailing ## References heading"
	// behavior so docs without `references:` still render correctly.
	const references = parseReferences(ctx.options.references);
	const cite = processCitations(ctx.bodyHtml, references, acmStyle);
	const bodyHtml = cite.hasCitations ? stripReferencesHeading(cite.body) : cite.body;
	const { body, references: manualRefs } = cite.hasCitations
		? { body: bodyHtml, references: null }
		: splitReferences(bodyHtml);

	const venueStrap = opts.venue
		? `<div class="paper-venue">${opts.venue}</div>`
		: '';

	const titleBlock = `
<header class="paper-title-block">
	${venueStrap}
	<h1 class="paper-title">${ctx.meta.title}</h1>
	${renderAuthors(authors)}
</header>`;

	const abstractBlock = renderAbstract(opts.abstract, 'Keywords', opts.keywords ?? []);

	// Wrap auto-generated citations in the two-column references layout so
	// they balance like the rest of the body. The processor returns a
	// standalone <section class="references-section"> — strip that outer
	// wrapper and reinject inside the paper's .references container.
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
<style>${ACM_LOCAL_CSS} ${ACADEMIC_CSS}</style>
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

export const acm: Template = {
	id: 'acm',
	label: 'ACM — Scientific Paper',
	buildFull: buildHtml
};
