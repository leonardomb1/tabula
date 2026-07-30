import { StreamLanguage, syntaxTree, type StreamParser } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import {
	snippetCompletion,
	type Completion,
	type CompletionSource
} from '@codemirror/autocomplete';

const KEYWORDS = new Set([
	'let', 'set', 'show', 'import', 'include', 'if', 'else', 'for', 'in', 'while',
	'break', 'continue', 'return', 'context', 'as', 'and', 'or', 'not'
]);

const LITERALS = new Set(['none', 'auto', 'true', 'false']);

const UNIT = /^\d+(?:\.\d+)?(?:pt|mm|cm|in|em|fr|deg|rad|%)?/;

interface TypstState {
	comment: boolean;
	math: boolean;
	stack: ('code' | 'markup')[];
}

const parser: StreamParser<TypstState> = {
	name: 'typst',

	startState: () => ({ comment: false, math: false, stack: [] }),

	token(stream, state) {
		const inCode = state.stack[state.stack.length - 1] === 'code';

		if (state.comment) {
			if (stream.match(/^[\s\S]*?\*\//)) state.comment = false;
			else stream.skipToEnd();
			return 'comment';
		}
		if (stream.match('/*')) {
			state.comment = true;
			return 'comment';
		}
		if (stream.match('//')) {
			stream.skipToEnd();
			return 'comment';
		}

		if (stream.eatSpace()) return null;

		if (stream.match('"')) {
			while (!stream.eol()) {
				if (stream.match('\\')) {
					stream.next();
					continue;
				}
				if (stream.match('"')) break;
				stream.next();
			}
			return 'string';
		}

		if (stream.match('$')) {
			state.math = !state.math;
			return 'operator';
		}
		if (state.math) {
			if (stream.match(/^[A-Za-z][A-Za-z0-9]*/)) return 'variableName';
			if (stream.match(UNIT)) return 'number';
			stream.next();
			return 'operator';
		}

		const ch = stream.peek();

		if (ch === '(' || ch === '{') {
			stream.next();
			state.stack.push('code');
			return 'punctuation';
		}
		if (ch === '[') {
			stream.next();
			state.stack.push('markup');
			return 'punctuation';
		}
		if (ch === ')' || ch === '}' || ch === ']') {
			stream.next();
			state.stack.pop();
			return 'punctuation';
		}

		if (stream.match('#')) {
			const word = stream.match(/^[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*/) as
				| RegExpMatchArray
				| null;
			if (!word) return 'operator';
			const head = word[0].split('.')[0];
			if (KEYWORDS.has(head)) return 'keyword';
			if (LITERALS.has(head)) return 'literal';
			return 'variableName.function';
		}

		if (stream.match(/^<[\w-]+>/)) return 'labelName';
		if (stream.match(/^@[\w-]+/)) return 'labelName';

		if (inCode) {
			if (stream.match(/^[A-Za-z_][\w-]*(?=\s*:)/)) return 'propertyName';
			const word = stream.match(/^[A-Za-z_][\w-]*/) as RegExpMatchArray | null;
			if (word) {
				if (KEYWORDS.has(word[0])) return 'keyword';
				if (LITERALS.has(word[0])) return 'literal';
				return stream.peek() === '(' ? 'variableName.function' : 'variableName';
			}
			if (stream.match(UNIT)) return 'number';
			if (stream.match(/^[=+\-*/<>!,;.:|]/)) return 'operator';
			stream.next();
			return null;
		}

		if (stream.sol() && stream.match(/^=+(?=\s)/)) {
			stream.skipToEnd();
			return 'heading';
		}
		if (stream.match(/^\*[^*\n]+\*/)) return 'strong';
		if (stream.match(/^_[^_\n]+_/)) return 'emphasis';
		if (stream.match(/^`[^`\n]*`/)) return 'monospace';
		if (stream.match(UNIT)) return 'number';
		if (stream.match(/^[A-Za-z_][\w-]*/)) return null;

		stream.next();
		return null;
	},

	languageData: {
		commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
		closeBrackets: { brackets: ['(', '[', '{', '"', '$'] }
	}
};

export const typstLanguage = StreamLanguage.define(parser);

const LAYOUT = [
	'page', 'par', 'block', 'box', 'pad', 'align', 'place', 'stack', 'grid', 'columns',
	'colbreak', 'pagebreak', 'v', 'h', 'hide', 'move', 'rotate', 'scale', 'repeat'
];
const CONTENT = [
	'text', 'heading', 'strong', 'emph', 'raw', 'link', 'ref', 'label', 'figure', 'image',
	'table', 'list', 'enum', 'terms', 'quote', 'cite', 'bibliography', 'outline', 'footnote',
	'underline', 'overline', 'strike', 'highlight', 'smallcaps', 'upper', 'lower', 'sub', 'super'
];
const GRAPHICS = ['rect', 'square', 'circle', 'ellipse', 'line', 'path', 'polygon', 'curve'];
const VALUES = [
	'rgb', 'luma', 'cmyk', 'oklab', 'oklch', 'gradient', 'calc', 'datetime', 'str', 'int',
	'float', 'range', 'read', 'json', 'yaml', 'toml', 'csv', 'xml', 'lorem', 'repr', 'type'
];
const STATEFUL = ['counter', 'state', 'context', 'query', 'measure', 'layout', 'numbering'];

function fn(name: string, detail: string): Completion {
	return snippetCompletion(`${name}(\${})`, { label: name, type: 'function', detail });
}

const FUNCTION_COMPLETIONS: Completion[] = [
	...LAYOUT.map((n) => fn(n, 'layout')),
	...CONTENT.map((n) => fn(n, 'content')),
	...GRAPHICS.map((n) => fn(n, 'graphics')),
	...VALUES.map((n) => fn(n, 'value')),
	...STATEFUL.map((n) => fn(n, 'state'))
];

const KEYWORD_COMPLETIONS: Completion[] = [...KEYWORDS, ...LITERALS].map((k) => ({
	label: k,
	type: 'keyword'
}));

const DIRECTIVE_COMPLETIONS: Completion[] = [
	snippetCompletion('@description ${}', {
		label: '@description',
		type: 'meta',
		detail: 'shown in the export dialog'
	}),
	snippetCompletion('@option ${key} ${text} "${default}" ${help}', {
		label: '@option',
		type: 'meta',
		detail: 'a field in the export dialog'
	})
];

export function inTypstFence(state: EditorState, pos: number): boolean {
	for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent!) {
		if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') continue;
		const info = node.getChild('CodeInfo');
		if (!info) return false;
		const lang = state.sliceDoc(info.from, info.to).trim().toLowerCase();
		return lang === 'typst' || lang === 'typ';
	}
	return false;
}

export function typstFenceCompletions(inputKeys: string[] = []): CompletionSource {
	const inner = typstCompletions(inputKeys);
	return (ctx) => (inTypstFence(ctx.state, ctx.pos) ? inner(ctx) : null);
}

export function typstCompletions(inputKeys: string[] = []): CompletionSource {
	const inputCompletions: Completion[] = inputKeys.map((key) => ({
		label: key,
		type: 'property',
		detail: 'sys.inputs'
	}));

	return (ctx) => {
		const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 80), ctx.pos);

		if (/sys\.inputs\.at\(\s*"[^"]*$/.test(before)) {
			const open = ctx.matchBefore(/"[^"]*$/);
			if (open) {
				return { from: open.from + 1, options: inputCompletions, validFor: /^[\w.-]*$/ };
			}
		}

		const directive = ctx.matchBefore(/\/\/\s*@[\w]*$/);
		if (directive) {
			const at = directive.text.lastIndexOf('@');
			return {
				from: directive.from + at,
				options: DIRECTIVE_COMPLETIONS,
				validFor: /^@[\w]*$/
			};
		}

		const hash = ctx.matchBefore(/#[\w.]*$/);
		if (hash) {
			return {
				from: hash.from + 1,
				options: [...KEYWORD_COMPLETIONS, ...FUNCTION_COMPLETIONS],
				validFor: /^[\w.]*$/
			};
		}

		const word = ctx.matchBefore(/[\w.]+$/);
		if (!word && !ctx.explicit) return null;
		return {
			from: word ? word.from : ctx.pos,
			options: [...KEYWORD_COMPLETIONS, ...FUNCTION_COMPLETIONS],
			validFor: /^[\w.]*$/
		};
	};
}
