<script lang="ts">
	import { onMount } from 'svelte';

	let {
		value = $bindable(''),
		onchange,
		ariaLabel,
		language = 'markdown',
		inputKeys = [],
		onuploadimage
	}: {
		value?: string;
		onchange?: () => void;
		ariaLabel: string;
		language?: 'markdown' | 'typst';
		inputKeys?: string[];
		onuploadimage?: (file: File) => Promise<{ url: string; filename: string } | null>;
	} = $props();

	let host = $state<HTMLDivElement | null>(null);
	let mounted = $state(false);

	onMount(() => {
		let view: import('@codemirror/view').EditorView | undefined;
		let disposed = false;

		(async () => {
			const [
				{ EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor },
				{ EditorState },
				{ defaultKeymap, history, historyKeymap, indentWithTab },
				{
					syntaxHighlighting,
					HighlightStyle,
					indentOnInput,
					bracketMatching,
					LanguageDescription,
					LanguageSupport
				},
				{ markdown },
				{ searchKeymap, highlightSelectionMatches },
				{ closeBrackets, closeBracketsKeymap, autocompletion },
				{ tags },
				{ typstLanguage, typstCompletions, typstFenceCompletions }
			] = await Promise.all([
				import('@codemirror/view'),
				import('@codemirror/state'),
				import('@codemirror/commands'),
				import('@codemirror/language'),
				import('@codemirror/lang-markdown'),
				import('@codemirror/search'),
				import('@codemirror/autocomplete'),
				import('@lezer/highlight'),
				import('$lib/codemirror/typst')
			]);

			if (disposed || !host) return;

			let typstSupport: import('@codemirror/state').Extension = typstLanguage;
			if (language === 'typst') {
				try {
					const { typst } = await import('codemirror-lang-typst');
					typstSupport = typst();
				} catch {
				}
			}
			if (disposed || !host) return;

			const highlight = HighlightStyle.define([
				{ tag: tags.heading, color: 'var(--cm-heading)', fontWeight: '600' },
				{ tag: tags.strong, color: 'var(--cm-strong)', fontWeight: '600' },
				{ tag: tags.emphasis, color: 'var(--cm-strong)', fontStyle: 'italic' },
				{ tag: tags.link, color: 'var(--cm-link)', textDecoration: 'underline' },
				{ tag: tags.url, color: 'var(--cm-link)' },
				{ tag: tags.monospace, color: 'var(--cm-code)' },
				{ tag: tags.quote, color: 'var(--cm-quote)', fontStyle: 'italic' },
				{ tag: tags.list, color: 'var(--cm-marker)' },
				{ tag: tags.processingInstruction, color: 'var(--cm-marker)' },
				{ tag: tags.contentSeparator, color: 'var(--cm-marker)' },
				{ tag: tags.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
				{ tag: tags.keyword, color: 'var(--cm-keyword)' },
				{ tag: tags.literal, color: 'var(--cm-keyword)' },
				{ tag: tags.string, color: 'var(--cm-string)' },
				{ tag: tags.number, color: 'var(--cm-number)' },
				{ tag: tags.function(tags.variableName), color: 'var(--cm-fn)' },
				{ tag: tags.propertyName, color: 'var(--cm-prop)' },
				{ tag: tags.variableName, color: 'var(--text)' },
				{ tag: tags.labelName, color: 'var(--cm-link)' },
				{ tag: tags.operator, color: 'var(--cm-marker)' },
				{ tag: tags.punctuation, color: 'var(--text-muted)' },
				{ tag: tags.definitionKeyword, color: 'var(--cm-keyword)', fontWeight: '600' },
				{ tag: tags.moduleKeyword, color: 'var(--cm-keyword)', fontWeight: '600' },
				{ tag: tags.controlKeyword, color: 'var(--cm-keyword)' },
				{ tag: tags.operatorKeyword, color: 'var(--cm-keyword)' },
				{ tag: tags.bool, color: 'var(--cm-keyword)' },
				{ tag: tags.integer, color: 'var(--cm-number)' },
				{ tag: tags.float, color: 'var(--cm-number)' },
				{ tag: tags.escape, color: 'var(--cm-marker)' },
				{ tag: tags.annotation, color: 'var(--cm-prop)' },
				{ tag: tags.content, color: 'var(--text)' },
				{ tag: tags.list, color: 'var(--cm-marker)' },
				{ tag: tags.separator, color: 'var(--text-muted)' },
				{ tag: tags.brace, color: 'var(--text-muted)' },
				{ tag: tags.bracket, color: 'var(--text-muted)' },
				{ tag: tags.paren, color: 'var(--text-muted)' },
				{ tag: tags.arithmeticOperator, color: 'var(--cm-marker)' },
				{ tag: tags.compareOperator, color: 'var(--cm-marker)' },
				{ tag: tags.updateOperator, color: 'var(--cm-marker)' },
				{ tag: tags.controlOperator, color: 'var(--cm-marker)' },
				{ tag: tags.definitionOperator, color: 'var(--cm-marker)' },
				{ tag: tags.typeOperator, color: 'var(--cm-marker)' },
				{ tag: tags.invalid, color: 'var(--danger)' }
			]);

			const theme = EditorView.theme({
				'&': {
					height: '100%',
					color: 'var(--text)',
					backgroundColor: 'var(--surface)',
					fontSize: '13.5px'
				},
				'.cm-scroller': {
					fontFamily: 'var(--font-mono)',
					lineHeight: '1.65',
					overflow: 'auto'
				},
				'.cm-content': { padding: '12px 0', caretColor: 'var(--brand)' },
				'.cm-gutters': {
					backgroundColor: 'transparent',
					color: 'var(--text-faint)',
					border: 'none',
					paddingInlineEnd: '6px'
				},
				'.cm-activeLine': { backgroundColor: 'var(--cm-active)' },
				'.cm-activeLineGutter': {
					backgroundColor: 'var(--cm-active)',
					color: 'var(--text-muted)'
				},
				'&.cm-focused': { outline: 'none' },
				'.cm-selectionBackground, ::selection': { backgroundColor: 'var(--cm-selection)' },
				'&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--cm-selection)' },
				'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--brand)' },
				'.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
					backgroundColor: 'var(--cm-active)',
					outline: '1px solid var(--border-strong)'
				},
				'.cm-selectionMatch': { backgroundColor: 'var(--cm-active)' },
				'.cm-searchMatch': { backgroundColor: 'var(--cm-selection)' },
				'.cm-panels': {
					backgroundColor: 'var(--bg-rail)',
					color: 'var(--text)',
					border: '1px solid var(--border)'
				},
				'.cm-panel input, .cm-panel button': {
					fontFamily: 'var(--font-ui)',
					fontSize: '12px'
				}
			});

			// Reads onuploadimage at event time, so the parent can enable/disable it live.
			const uploadFiles = (
				list: FileList | null | undefined,
				v: import('@codemirror/view').EditorView
			): boolean => {
				const upload = onuploadimage;
				if (!upload) return false;
				const images = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
				if (!images.length) return false;
				void (async () => {
					for (const f of images) {
						const res = await upload(f).catch(() => null);
						if (!res) continue;
						const insert = `![${res.filename}](${res.url})`;
						const range = v.state.selection.main;
						v.dispatch({
							changes: { from: range.from, to: range.to, insert },
							selection: { anchor: range.from + insert.length }
						});
					}
				})();
				return true;
			};

			view = new EditorView({
				parent: host,
				state: EditorState.create({
					doc: value,
					extensions: [
						EditorView.domEventHandlers({
							paste: (event, v) => uploadFiles(event.clipboardData?.files, v),
							drop: (event, v) => uploadFiles(event.dataTransfer?.files, v)
						}),
						lineNumbers(),
						highlightActiveLine(),
						highlightActiveLineGutter(),
						highlightSelectionMatches(),
						history(),
						drawSelection(),
						rectangularSelection(),
						crosshairCursor(),
						indentOnInput(),
						bracketMatching(),
						closeBrackets(),
						...(language === 'typst'
							? [
									typstSupport,
									autocompletion({ override: [typstCompletions(inputKeys)] })
								]
							: [
									markdown({
										codeLanguages: [
											LanguageDescription.of({
												name: 'typst',
												alias: ['typ'],
												support: undefined,
												load: async () => {
													try {
														const { typst } = await import('codemirror-lang-typst');
														return typst();
													} catch {
														return new LanguageSupport(typstLanguage);
													}
												}
											})
										]
									}),
									autocompletion({ override: [typstFenceCompletions(inputKeys)] })
								]),
						syntaxHighlighting(highlight),
						theme,
						EditorView.lineWrapping,
						keymap.of([
							...closeBracketsKeymap,
							...defaultKeymap,
							...historyKeymap,
							...searchKeymap,
							indentWithTab
						]),
						EditorView.updateListener.of((update) => {
							if (!update.docChanged) return;
							value = update.state.doc.toString();
							onchange?.();
						})
					]
				})
			});

			mounted = true;
		})();

		return () => {
			disposed = true;
			view?.destroy();
		};
	});
</script>

<div class="editor" class:ready={mounted} bind:this={host} aria-label={ariaLabel}></div>

<style>
	.editor {
		height: 100%;
		min-height: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;

		--cm-heading: var(--text);
		--cm-strong: var(--text);
		--cm-link: #7aa2f7;
		--cm-code: #9ece6a;
		--cm-quote: var(--text-muted);
		--cm-marker: var(--brand);
		--cm-active: rgb(255 255 255 / 0.04);
		--cm-selection: rgb(230 55 25 / 0.25);
		--cm-keyword: #bb9af7;
		--cm-string: #9ece6a;
		--cm-number: #ff9e64;
		--cm-fn: #7dcfff;
		--cm-prop: #e0af68;
	}
	.editor:focus-within {
		border-color: var(--border-strong);
	}

	@media (prefers-color-scheme: light) {
		:global(:root:not([data-theme='dark'])) .editor {
			--cm-link: #2b5fd9;
			--cm-code: #227d4f;
			--cm-active: rgb(0 0 0 / 0.035);
			--cm-keyword: #7b3fc4;
			--cm-string: #227d4f;
			--cm-number: #b45309;
			--cm-fn: #1d6fa5;
			--cm-prop: #8a6d1f;
		}
	}
	:global(:root[data-theme='light']) .editor {
		--cm-link: #2b5fd9;
		--cm-code: #227d4f;
		--cm-active: rgb(0 0 0 / 0.035);
		--cm-keyword: #7b3fc4;
		--cm-string: #227d4f;
		--cm-number: #b45309;
		--cm-fn: #1d6fa5;
		--cm-prop: #8a6d1f;
	}
</style>
