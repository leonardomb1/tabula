import type { PluginSimple } from 'markdown-it';

export interface DocRef {
	id: string;
	slug: string;
	title: string;
}

export interface WikiEnv {
	workspaceId?: string;
	wikiResolve?: Map<string, DocRef>;
}

const OPEN = 0x5b;

export const wikilinks: PluginSimple = (md) => {
	md.inline.ruler.before('link', 'wikilink', (state, silent) => {
		const start = state.pos;
		if (state.src.charCodeAt(start) !== OPEN || state.src.charCodeAt(start + 1) !== OPEN) {
			return false;
		}
		const end = state.src.indexOf(']]', start + 2);
		if (end < 0) return false;
		const inner = state.src.slice(start + 2, end);
		if (inner.length === 0 || inner.includes('[')) return false;

		if (!silent) {
			const pipe = inner.indexOf('|');
			const target = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
			const label = (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim();
			const token = state.push('wikilink', '', 0);
			token.meta = { target, label };
		}
		state.pos = end + 2;
		return true;
	});

	md.renderer.rules.wikilink = (tokens, idx, _opts, env: WikiEnv) => {
		const { target, label } = tokens[idx].meta as { target: string; label: string };
		const esc = md.utils.escapeHtml;
		const hit = env.wikiResolve?.get(target);
		if (hit && env.workspaceId) {
			return `<a class="wiki-link" href="/w/${esc(env.workspaceId)}/${esc(hit.slug)}" title="${esc(hit.title)}">${esc(label)}</a>`;
		}
		return `<a class="wiki-link broken" title="Not found: ${esc(target)}">${esc(label)}</a>`;
	};
};

export function extractWikiTargets(source: string): string[] {
	const out = new Set<string>();
	const re = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source))) out.add(m[1].trim());
	return [...out];
}
