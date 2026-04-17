import { marked } from 'marked';
import hljs from 'highlight.js';
import markedKatex from 'marked-katex-extension';
import matter from 'gray-matter';

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

// Wrap every <table> in a scrollable container so wide tables don't overflow
// the viewport on mobile — the wrapper scrolls horizontally instead.
marked.use({
	hooks: {
		postprocess(html: string) {
			return html.replace(
				/<table(\s[^>]*)?>([\s\S]*?)<\/table>/g,
				'<div class="table-wrap"><table$1>$2</table></div>'
			);
		}
	}
});

export function extractWikiLinks(source: string): string[] {
	return [...source.matchAll(/\[\[([a-zA-Z0-9_-]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1]);
}

export interface Frontmatter {
	title?: string;
	author?: string;
	date?: string;
	description?: string;
	public?: boolean;
	tags?: string[];
	formal?: boolean;
	version?: string;
	doctype?: string;
	footer?: string;
	approvals?: boolean | string[];
	cover?: string | boolean;
	coverImage?: string;
	confidential?: boolean;
	company?: string;
	qrCode?: boolean;
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

export function parseFrontmatter(source: string): { frontmatter: Frontmatter; body: string } {
	try {
		const { data, content } = matter(source);
		return { frontmatter: data as Frontmatter, body: content };
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
