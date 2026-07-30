import { getEngine } from './engine';
import { parseFrontmatter, metaFromFrontmatter } from './frontmatter';
import { extractMarkdownText } from './text';
import { getOrCompileSnippetSvg } from '../typst';
import type { DocRef, WikiEnv } from './wikilinks';

export type { DocRef } from './wikilinks';

export type RefResolver = (
	workspaceId: string,
	targets: string[]
) => Promise<Map<string, DocRef>>;

export interface RenderResult {
	html: string;
	plainText: string;
	frontmatter: Record<string, unknown>;
	title?: string;
	tags?: string[];
	isPublic?: boolean;
	outgoingLinks: string[];
}

export async function renderMarkdown(
	source: string,
	opts: {
		workspaceId: string;
		resolveRefs: RefResolver;
		hrefFor?: (ref: DocRef) => string | null;
	}
): Promise<RenderResult> {
	const md = await getEngine();
	const { data, content } = parseFrontmatter(source);
	const env: WikiEnv = {
		workspaceId: opts.workspaceId,
		wikiResolve: new Map(),
		hrefFor: opts.hrefFor
	};
	const tokens = md.parse(content, env);

	type MdToken = {
		type: string;
		info: string;
		content: string;
		meta?: unknown;
		children?: MdToken[] | null;
	};
	const snippets: string[] = [];
	const targets = new Set<string>();
	const walk = (toks: MdToken[]) => {
		for (const t of toks) {
			if (t.type === 'fence' && t.info.trim().split(/\s+/)[0] === 'typst') snippets.push(t.content);
			if (t.type === 'wikilink') targets.add((t.meta as { target: string }).target);
			if (t.children) walk(t.children);
		}
	};
	walk(tokens as unknown as MdToken[]);

	const [, resolved] = await Promise.all([
		Promise.all(snippets.map((s) => getOrCompileSnippetSvg(s))),
		opts.resolveRefs(opts.workspaceId, [...targets])
	]);
	env.wikiResolve = resolved;

	const html = md.renderer.render(tokens, md.options, env);

	return {
		html,
		plainText: extractMarkdownText(source),
		frontmatter: data,
		outgoingLinks: [...targets],
		...metaFromFrontmatter(data)
	};
}
