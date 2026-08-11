import MarkdownIt from 'markdown-it';
import { createHighlighter } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { fromHighlighter } from '@shikijs/markdown-it/core';
import { snippetId } from '../typst';
import { wikilinks } from './wikilinks';

const LANGS = [
	'javascript', 'typescript', 'tsx', 'jsx', 'json', 'jsonc', 'bash', 'shell',
	'python', 'sql', 'rust', 'go', 'c', 'cpp', 'java', 'html', 'css', 'scss',
	'svelte', 'vue', 'yaml', 'toml', 'markdown', 'diff', 'dockerfile', 'ini',
	'xml', 'php', 'ruby', 'kotlin', 'swift', 'graphql', 'nginx'
];

let enginePromise: Promise<MarkdownIt> | null = null;

export function getEngine(): Promise<MarkdownIt> {
	if (!enginePromise) enginePromise = build();
	return enginePromise;
}

async function build(): Promise<MarkdownIt> {
	const highlighter = await createHighlighter({
		themes: ['github-light', 'github-dark'],
		langs: LANGS,
		engine: createJavaScriptRegexEngine({ forgiving: true })
	});

	const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

	md.use(
		fromHighlighter(highlighter, {
			themes: { light: 'github-light', dark: 'github-dark' },
			defaultColor: false,
			fallbackLanguage: 'text'
		} as unknown as Parameters<typeof fromHighlighter>[1])
	);

	md.use(wikilinks);

	const shikiFence = md.renderer.rules.fence!;
	md.renderer.rules.fence = (tokens, idx, options, env, self) => {
		const info = tokens[idx].info.trim().split(/\s+/)[0];
		if (info === 'typst') {
			const id = snippetId(tokens[idx].content);
			// The inner scroller keeps a wide diagram scrollable while the expand
			// button stays pinned to the figure's own corner.
			return `<figure class="typst-figure"><div class="typst-scroll"><img src="/api/render/typst/${id}" alt="Typst figure" loading="lazy" /></div></figure>\n`;
		}
		return shikiFence(tokens, idx, options, env, self);
	};

	return md;
}
