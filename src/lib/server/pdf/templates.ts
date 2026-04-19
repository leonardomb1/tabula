/**
 * Template registry. Each template is a module that knows how to build a
 * self-contained HTML document for Puppeteer to print.
 *
 * Adding a new template = one file under ./templates/ exporting a `Template`
 * and one line in the `TEMPLATES` map below.
 *
 * ── Data model ────────────────────────────────────────────────────────────
 *
 * `CommonMeta` is what every template receives — the things that make sense
 * across formal docs, academic papers, and theses (title, author, date,
 * description, tags, docUrl for QR codes).
 *
 * Template-specific knobs live under a sub-key in frontmatter matching the
 * template id, e.g.:
 *
 *   ```yaml
 *   template: acm
 *   acm:
 *     authors:
 *       - name: Alice
 *         affiliation: MIT
 *     abstract: |
 *       …
 *     keywords: [scaling, data]
 *   ```
 *
 * The export endpoint reads that sub-map and passes it to the template as
 * `options: Record<string, unknown>`. Each template narrows the options at
 * its boundary — keeps the registry type-flat while letting templates ship
 * their own typed shapes.
 */

import type { Branding } from '$lib/branding';
import { argos } from './templates/argos';
import { acm } from './templates/acm';
import { ieee } from './templates/ieee';
import { abnt } from './templates/abnt';

export interface CommonMeta {
	title: string;
	/** Single author name, or an array for sci-paper multi-author docs. */
	author?: string | string[];
	date?: string;
	description?: string;
	tags?: string[];
	/** Rendered as a cover-page QR code by templates that support it. */
	docUrl?: string;
}

export interface TocEntry {
	level: number;
	id: string;
	text: string;
}

export interface RenderContext {
	meta: CommonMeta;
	/**
	 * Template-specific options from the matching frontmatter sub-map.
	 * Narrowed inside each template.
	 */
	options: Record<string, unknown>;
	bodyHtml: string;
	toc: TocEntry[];
	branding: Branding;
	/** Pre-resolved cover SVG or image data URL — null when disabled. */
	coverVisual: string | null;
}

export interface Template {
	id: string;
	label: string;
	/** Full render: cover + optional TOC + body + optional signatures. */
	buildFull(ctx: RenderContext): Promise<string>;
	/**
	 * Count of pre-textual pages (cover, TOC, resumo, abstract, dedicatória,
	 * etc.) rendered before the body. Used to offset auto-filled TOC page
	 * numbers. Defaults to a conservative `hasToc ? 2 : 1` (cover + optional
	 * TOC) when not provided — enough for argos, wrong for ABNT.
	 */
	preTextualPages?(ctx: RenderContext): number;
}

const TEMPLATES: Record<string, Template> = {
	argos,
	acm,
	ieee,
	abnt
};

export const DEFAULT_TEMPLATE_ID = 'argos';

export function getTemplate(id?: string): Template {
	if (id && id in TEMPLATES) return TEMPLATES[id];
	return TEMPLATES[DEFAULT_TEMPLATE_ID];
}

export function listTemplates(): Array<{ id: string; label: string }> {
	return Object.values(TEMPLATES).map((t) => ({ id: t.id, label: t.label }));
}
