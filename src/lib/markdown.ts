import { marked } from 'marked';
import hljs from 'highlight.js';
import markedKatex from 'marked-katex-extension';
import { load as yamlLoad } from 'js-yaml';

marked.setOptions({ gfm: true, breaks: false });
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const renderer = new marked.Renderer();

renderer.code = function ({ text, lang }) {
	if (lang === 'mermaid') return `<pre class="mermaid">${text}</pre>\n`;
	const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
	const highlighted = hljs.highlight(text, { language }).value;
	return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

renderer.heading = function ({ text, depth }) {
	const id = text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
	return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};

marked.use({ renderer });

const wikiLinkExt = {
	name: 'wikiLink',
	level: 'inline' as const,
	start: (src: string) => src.indexOf('[['),
	tokenizer(src: string) {
		const m = /^\[\[([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\]/.exec(src);
		if (m) return { type: 'wikiLink', raw: m[0], slug: m[1], label: m[2] };
	},
	renderer: (token: any) =>
		`<a href="/${token.slug}" class="wiki-link">${token.label ?? `[[${token.slug}]]`}</a>`
};
marked.use({ extensions: [wikiLinkExt] });

// Post-processing on the rendered HTML:
//
//   1. Wrap every <table> in a scrollable container so wide tables don't
//      overflow the viewport on mobile — the wrapper scrolls horizontally
//      on the web view and collapses to full width for print.
//   2. Turn `<!-- pagebreak -->` comments into a zero-height div with
//      `break-before: page`. Invisible in the web viewer; PDF templates
//      all respect CSS fragmentation breaks, so the marker forces a new
//      page in argos, acm, ieee and abnt without extra CSS per template.
marked.use({
	hooks: {
		postprocess(html: string) {
			return html
				.replace(
					/<table(\s[^>]*)?>([\s\S]*?)<\/table>/g,
					'<div class="table-wrap"><table$1>$2</table></div>'
				)
				.replace(
					/<!--\s*pagebreak\s*-->/gi,
					'<div class="page-break" style="break-before:page;height:0;margin:0;padding:0" aria-hidden="true"></div>'
				);
		}
	}
});

export function extractWikiLinks(source: string): string[] {
	return [...source.matchAll(/\[\[([a-zA-Z0-9_-]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1]);
}

export interface Frontmatter {
	title?: string;
	author?: string | string[];
	date?: string;
	description?: string;
	public?: boolean;
	tags?: string[];
	formal?: boolean;

	/**
	 * Picks the PDF template. Defaults to `argos` when absent so legacy docs
	 * keep rendering with their flat-key options.
	 */
	template?: string;

	/**
	 * Legacy flat argos keys — read by the export endpoint when no
	 * `argos:` sub-map is present. Kept here for docs written before the
	 * namespaced layout.
	 */
	version?: string;
	doctype?: string;
	footer?: string;
	approvals?: boolean | string[];
	cover?: string | boolean;
	coverImage?: string;
	confidential?: boolean;
	company?: string;
	qrCode?: boolean;

	/**
	 * Namespaced template options. Opaque to the client — each server-side
	 * template narrows its own sub-map with runtime type checks.
	 */
	argos?: Record<string, unknown>;
	acm?: Record<string, unknown>;
	ieee?: Record<string, unknown>;
	abnt?: Record<string, unknown>;
}

export interface TocEntry {
	level: number;
	id: string;
	text: string;
}

export interface RenderResult {
	html: string;
	toc: TocEntry[];
	title: string;
	frontmatter: Frontmatter;
}

// Matches YAML frontmatter at the very start of the doc: `---\n<yaml>\n---\n`.
// Using js-yaml directly (instead of gray-matter) so the parser runs identically
// in Node and the browser — gray-matter pulls in Node built-ins that silently
// fail client-side and leave the raw YAML visible in the rendered preview.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(source: string): { frontmatter: Frontmatter; body: string } {
	const match = FRONTMATTER_RE.exec(source);
	if (!match) return { frontmatter: {}, body: source };
	try {
		const parsed = yamlLoad(match[1]);
		const frontmatter = (parsed && typeof parsed === 'object') ? (parsed as Frontmatter) : {};
		return { frontmatter, body: source.slice(match[0].length) };
	} catch {
		return { frontmatter: {}, body: source };
	}
}

export function renderMarkdown(source: string): RenderResult {
	const { frontmatter, body } = parseFrontmatter(source);
	const html = marked.parse(body) as string;

	const toc: TocEntry[] = [];
	const headingRe = /<h([1-3]) id="([^"]+)">([^<]+)<\/h[1-3]>/g;
	let match;
	while ((match = headingRe.exec(html)) !== null) {
		toc.push({ level: parseInt(match[1]), id: match[2], text: match[3] });
	}

	const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/.exec(html);
	const title = frontmatter.title ?? (titleMatch ? titleMatch[1] : 'Untitled');

	return { html, toc, title, frontmatter };
}
