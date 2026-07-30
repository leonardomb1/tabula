import MarkdownIt from 'markdown-it';
import { parseFrontmatter } from './frontmatter';

type MdToken = { type: string; info: string; content: string; children?: MdToken[] | null };

const textMd = new MarkdownIt({ html: false });

export function extractMarkdownText(source: string): string {
	const { content } = parseFrontmatter(source);
	const tokens = textMd.parse(content, {}) as unknown as MdToken[];
	const parts: string[] = [];

	const walk = (toks: MdToken[]) => {
		for (const t of toks) {
			if (t.type === 'fence' && t.info.trim().split(/\s+/)[0] === 'typst') continue;
			if (
				t.type === 'text' ||
				t.type === 'code_inline' ||
				t.type === 'fence' ||
				t.type === 'code_block'
			) {
				if (t.content) parts.push(t.content);
			} else if (t.children) {
				walk(t.children);
			}
		}
	};
	walk(tokens);
	return parts.join(' ').replace(/\s+/g, ' ').trim();
}
