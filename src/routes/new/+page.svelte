<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import BrandLogo from '$lib/BrandLogo.svelte';
	import UserMenu from '$lib/UserMenu.svelte';
	import { aiDock, toggleAi } from '$lib/aiDock.svelte';
	import type { PageData } from './$types';
	import type { RenderResult } from '$lib/markdown';

	let { data }: { data: PageData } = $props();

	const STARTER = `# Documento sem título

Escreva seu markdown aqui. Suporta **negrito**, *itálico*, \`código\`, e muito mais.

## Seção

> Citações também ficam ótimas.

\`\`\`typescript
const greet = (name: string) => \`Olá, \${name}!\`;
\`\`\`
`;

	// Workspace context — taken from ?ws=<id> in the URL, defaulting to "default".
	const wsId = $derived($page.url.searchParams.get('ws') ?? 'default');

	let slug = $state('');
	let originalSlug = $state('');
	let content = $state(STARTER);
	let previewHtml = $state('');
	let previewTitle = $state('');
	let saving = $state(false);
	let lastSavedAt = $state<number | null>(null);
	// True for ~1.4 s after a successful save — drives the "✓ Salvo!" flash
	// and button pulse so the user sees a result beyond the text label change.
	let savedFlash = $state(false);
	let savedFlashTimer: ReturnType<typeof setTimeout> | null = null;
	let error = $state('');
	let debounceTimer: ReturnType<typeof setTimeout>;
	let editingExisting = $state(false);
	let mobilePane = $state<'editor' | 'preview'>('editor');
	let editorMenuOpen = $state(false);
	let renderMarkdownPromise: Promise<(src: string) => RenderResult> | null = null;

	// Derived stats for the sub-bar. Word-split on runs of whitespace — good
	// enough for Portuguese text; the Intl segmenter would be more accurate
	// but not worth the CJK-friendliness cost in this context.
	const wordCount = $derived.by(() => {
		const t = content.trim();
		return t ? t.split(/\s+/).length : 0;
	});
	const readMinutes = $derived(Math.max(1, Math.round(wordCount / 200)));

	// "Salvo há Xs" indicator. Recomputed on a 30-s tick so the label stays
	// fresh without running on every keystroke.
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(id);
	});
	const saveStatus = $derived.by(() => {
		if (saving) return { kind: 'saving', label: 'Salvando…' };
		if (lastSavedAt === null) return { kind: 'idle', label: editingExisting ? 'Pronto' : 'Rascunho' };
		const seconds = Math.max(1, Math.round((now - lastSavedAt) / 1000));
		if (seconds < 60) return { kind: 'saved', label: `Salvo há ${seconds}s` };
		const minutes = Math.round(seconds / 60);
		return { kind: 'saved', label: `Salvo há ${minutes}min` };
	});

	// CodeMirror re-measures after the pane becomes visible again on mobile.
	$effect(() => {
		mobilePane;
		if (editorView) queueMicrotask(() => editorView.requestMeasure());
	});

	interface HistoryEntry { timestamp: number; label: string; }
	let history = $state<HistoryEntry[]>([]);
	let historyOpen = $state(false);
	let restoring = $state(false);
	let uploading = $state(false);
	let dragOver = $state(false);

	// CodeMirror.
	let editorContainer: HTMLDivElement;
	let editorView: any = null;

	// AI edit
	let aiEditOpen = $state(false);
	let aiInstruction = $state('');
	let aiEditing = $state(false);
	let aiEditError = $state('');
	let aiInstructionEl = $state<HTMLInputElement | null>(null);

	function setEditorContent(text: string) {
		content = text;
		if (editorView) {
			editorView.dispatch({
				changes: { from: 0, to: editorView.state.doc.length, insert: text }
			});
		}
	}

	function insertAtCursor(text: string) {
		if (!editorView) return;
		const { from, to } = editorView.state.selection.main;
		editorView.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length }
		});
		editorView.focus();
		fetchPreview();
	}

	async function uploadFile(file: File) {
		uploading = true;
		const fd = new FormData();
		fd.append('file', file);
		const res = await fetch(`/api/upload?ws=${wsId}`, { method: 'POST', body: fd });
		uploading = false;
		if (!res.ok) {
			const data = await res.json();
			error = data.message ?? 'Erro ao enviar arquivo';
			return;
		}
		const { url, originalName } = await res.json();
		const isImage = file.type.startsWith('image/');
		insertAtCursor(isImage ? `![${originalName}](${url})\n` : `[${originalName}](${url})\n`);
	}

	function triggerFilePicker() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*,.pdf,.txt,.csv,.docx,.xlsx,.zip';
		input.onchange = () => { if (input.files?.[0]) uploadFile(input.files[0]); };
		input.click();
	}

	async function renderMermaid() {
		const { default: mermaid } = await import('mermaid');
		mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
		try {
			await mermaid.run({ querySelector: '.mermaid' });
		} catch {
			// Mermaid throws on narrow containers ("Could not find a suitable
			// point for the given distance") and similar layout edge cases.
			// The preview isn't a publication surface — falling back to the
			// raw fenced code is fine. Swallow silently so the console stays
			// clean on mobile.
		}
	}

	async function getRenderMarkdown() {
		if (!renderMarkdownPromise) {
			renderMarkdownPromise = import('$lib/markdown').then((m) => m.renderMarkdown);
		}
		return renderMarkdownPromise;
	}

	async function fetchPreview() {
		const renderMarkdown = await getRenderMarkdown();
		const { html, title } = renderMarkdown(content);
		previewHtml = html;
		previewTitle = title || 'Pré-visualização';
		await tick();
		renderMermaid();
	}

	function debounceMs(): number {
		const n = content.length;
		if (n < 5_000) return 150;
		if (n < 20_000) return 300;
		return 600;
	}

	function onContentInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(fetchPreview, debounceMs());
	}

	async function save() {
		error = '';
		if (!slug.trim()) { error = 'Nome do documento obrigatório'; return; }
		saving = true;
		const body: Record<string, string> = { slug: slug.trim(), content };
		if (editingExisting && originalSlug && originalSlug !== slug.trim()) {
			body.oldSlug = originalSlug;
		}
		const res = await fetch(`/api/save?ws=${wsId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		saving = false;
		if (res.ok) {
			lastSavedAt = Date.now();
			now = Date.now();
			savedFlash = true;
			if (savedFlashTimer) clearTimeout(savedFlashTimer);
			savedFlashTimer = setTimeout(() => (savedFlash = false), 1400);
			// When editing an existing doc, stay on the page and let the user
			// keep working; for new docs, navigate to the viewer.
			if (!editingExisting) {
				goto(`/w/${wsId}/${slug.trim()}`);
			} else {
				originalSlug = slug.trim();
			}
		} else {
			const data = await res.json();
			error = data.message ?? 'Erro ao salvar';
		}
	}

	async function deleteDoc() {
		if (!confirm(`Excluir "${slug}"? Esta ação não pode ser desfeita.`)) return;
		const res = await fetch(`/api/delete/${slug}?ws=${wsId}`, { method: 'DELETE' });
		if (res.ok) goto('/');
	}

	async function loadHistory() {
		if (!editingExisting) return;
		const res = await fetch(`/api/history/${originalSlug}?ws=${wsId}`);
		if (res.ok) history = await res.json();
	}

	async function restore(timestamp: number, label: string) {
		if (!confirm(`Restaurar versão de ${label}? O conteúdo atual será salvo como nova versão.`)) return;
		restoring = true;
		const res = await fetch(`/api/history/${originalSlug}/restore?ws=${wsId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timestamp })
		});
		restoring = false;
		if (res.ok) {
			const data = await res.json();
			setEditorContent(data.content);
			historyOpen = false;
			await loadHistory();
			fetchPreview();
		}
	}

	function openAiEdit() {
		aiEditOpen = true;
		aiEditError = '';
		tick().then(() => aiInstructionEl?.focus());
	}

	function closeAiEdit() {
		aiEditOpen = false;
		aiInstruction = '';
		aiEditError = '';
		editorView?.focus();
	}

	async function runAiEdit() {
		if (!editorView || !aiInstruction.trim() || aiEditing) return;

		const sel = editorView.state.selection.main;
		const selectedText = editorView.state.sliceDoc(sel.from, sel.to);

		if (!selectedText.trim()) {
			aiEditError = 'Selecione o texto que deseja modificar';
			return;
		}

		aiEditing = true;
		aiEditError = '';

		editorView.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } });
		let insertPos = sel.from;

		try {
			const res = await fetch('/api/ai/edit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selectedText, instruction: aiInstruction.trim() })
			});

			if (!res.ok) {
				editorView.dispatch({ changes: { from: sel.from, to: sel.from, insert: selectedText } });
				const data = await res.json().catch(() => ({}));
				aiEditError = data.message ?? 'Erro ao processar';
				return;
			}

			const reader = res.body!.getReader();
			const dec = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				for (const line of dec.decode(value).split('\n')) {
					if (!line.startsWith('data: ')) continue;
					const payload = line.slice(6);
					if (payload === '[DONE]') break;
					try {
						const parsed = JSON.parse(payload);
						if (parsed.text) {
							editorView.dispatch({
								changes: { from: insertPos, to: insertPos, insert: parsed.text }
							});
							insertPos += parsed.text.length;
						}
						if (parsed.error) aiEditError = parsed.error;
					} catch { /* ignore */ }
				}
			}

			content = editorView.state.doc.toString();
			fetchPreview();
			aiInstruction = '';
			aiEditOpen = false;
		} catch {
			editorView.dispatch({ changes: { from: sel.from, to: sel.from, insert: selectedText } });
			aiEditError = 'Falha na conexão';
		} finally {
			aiEditing = false;
		}
	}

	function handleAiKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAiEdit(); }
		if (e.key === 'Escape') closeAiEdit();
	}

	// ⌘S / Ctrl+S to save — works anywhere on the page, not only in the
	// CodeMirror keymap, since the slug input is a plain <input>.
	function onGlobalKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			save();
		}
	}


	onMount(async () => {
		let initialContent = STARTER;
		const editSlug = $page.url.searchParams.get('edit');
		if (editSlug) {
			editingExisting = true;
			slug = editSlug;
			originalSlug = editSlug;
			const fileRes = await fetch(`/api/load?slug=${editSlug}&ws=${wsId}`);
			if (fileRes.ok) initialContent = await fileRes.text();
			content = initialContent;
			loadHistory();
		}

		const [
			view,
			stateLib,
			commands,
			mdLang,
			langData,
			language,
			highlight
		] = await Promise.all([
			import('@codemirror/view'),
			import('@codemirror/state'),
			import('@codemirror/commands'),
			import('@codemirror/lang-markdown'),
			import('@codemirror/language-data'),
			import('@codemirror/language'),
			import('@lezer/highlight')
		]);

		const { EditorView, keymap, drawSelection, dropCursor } = view;
		const { EditorState } = stateLib;
		const { defaultKeymap, historyKeymap, indentWithTab, history: cmHistory } = commands;
		const { markdown, markdownLanguage } = mdLang;
		const { languages } = langData;
		const { HighlightStyle, syntaxHighlighting } = language;
		const { tags: t } = highlight;

		// Frontmatter block parser — consumes a top-of-doc `---\n…\n---` so
		// the closing `---` isn't styled as a setext H2 underline by the
		// default markdown grammar. `style` on the node spec maps each node
		// to a Lezer tag so the HighlightStyle below can color it.
		const frontmatterExt = {
			defineNodes: [
				{ name: 'FrontMatter', style: t.meta },
				{ name: 'FrontMatterMark', style: t.processingInstruction }
			],
			parseBlock: [
				{
					name: 'FrontMatter',
					before: 'SetextHeading',
					parse(cx: any, line: any) {
						if (cx.parsedPos !== 0) return false;
						if (line.text.trim() !== '---') return false;
						const openStart = cx.lineStart;
						const marks = [cx.elt('FrontMatterMark', openStart, openStart + 3)];
						while (cx.nextLine()) {
							if (line.text.trim() === '---') {
								const closeStart = cx.lineStart;
								marks.push(cx.elt('FrontMatterMark', closeStart, closeStart + 3));
								cx.addElement(cx.elt('FrontMatter', openStart, closeStart + 3, marks));
								cx.nextLine();
								return true;
							}
						}
						return false;
					}
				}
			]
		};

		// One highlight style that references CSS custom properties. The
		// properties themselves are redefined per theme in layout.css, so
		// the editor recolors automatically when the user flips Papel↔Tinta
		// — no compartment swap, no MutationObserver.
		const markdownHighlight = HighlightStyle.define([
			{ tag: t.heading1, color: 'var(--tok-heading)', fontWeight: '700' },
			{ tag: t.heading2, color: 'var(--tok-heading)', fontWeight: '600' },
			{ tag: t.heading3, color: 'var(--tok-heading)', fontWeight: '500' },
			{ tag: [t.heading4, t.heading5, t.heading6], color: 'var(--tok-heading)' },
			{ tag: t.strong, color: 'var(--tok-strong)', fontWeight: '700' },
			{ tag: t.emphasis, color: 'var(--tok-em)', fontStyle: 'italic' },
			{ tag: t.link, color: 'var(--tok-link)', textDecoration: 'underline' },
			{ tag: t.url, color: 'var(--tok-link)' },
			{ tag: t.monospace, color: 'var(--tok-code)', fontFamily: 'var(--font-mono)' },
			{ tag: t.list, color: 'var(--tok-list)' },
			{ tag: t.quote, color: 'var(--tok-comment)', fontStyle: 'italic' },
			{ tag: t.contentSeparator, color: 'var(--tok-rule)' },
			{ tag: t.processingInstruction, color: 'var(--tok-rule)', opacity: '0.55' },
			{ tag: t.meta, color: 'var(--tok-frontmatter-val)' }
		]);

		// Editor chrome — all colors reference CSS vars so the whole surface
		// swaps with the app theme without reconfiguring the extension.
		const editorTheme = EditorView.theme({
			'&': {
				height: '100%',
				backgroundColor: 'var(--ed-bg)',
				color: 'var(--ed-ink)'
			},
			'.cm-scroller': {
				overflow: 'auto',
				padding: '1.5rem',
				fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
				fontSize: '0.9rem',
				lineHeight: '1.65'
			},
			'.cm-content': { caretColor: 'var(--accent)' },
			'.cm-cursor': { borderLeftColor: 'var(--accent)' },
			'.cm-gutters': {
				backgroundColor: 'var(--ed-bg)',
				color: 'var(--ed-gutter)',
				border: 'none',
				borderRight: '1px solid var(--rule-soft)'
			},
			'.cm-activeLineGutter': { backgroundColor: 'var(--ed-line)' },
			'.cm-activeLine': { backgroundColor: 'var(--ed-line)' },
			'.cm-selectionBackground': { background: 'var(--accent-soft) !important' },
			'&.cm-focused .cm-selectionBackground': { background: 'var(--accent-soft) !important' }
		});

		const state = EditorState.create({
			doc: initialContent,
			extensions: [
				cmHistory(),
				drawSelection(),
				dropCursor(),
				EditorView.lineWrapping,
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [frontmatterExt] }),
				syntaxHighlighting(markdownHighlight),
				editorTheme,
				EditorView.updateListener.of((update: any) => {
					if (update.docChanged) {
						content = update.state.doc.toString();
						onContentInput();
					}
				}),
				EditorView.domEventHandlers({
					paste(event: ClipboardEvent) {
						const file = Array.from(event.clipboardData?.files ?? []).find(f => f.type.startsWith('image/'));
						if (file) { event.preventDefault(); uploadFile(file); return true; }
						return false;
					},
					dragover(event: DragEvent) { event.preventDefault(); dragOver = true; return false; },
					dragleave() { dragOver = false; return false; },
					drop(event: DragEvent) {
						const file = event.dataTransfer?.files[0];
						if (file) { event.preventDefault(); dragOver = false; uploadFile(file); return true; }
						dragOver = false;
						return false;
					}
				})
			]
		});

		editorView = new EditorView({ state, parent: editorContainer });
		fetchPreview();
	});
</script>

<svelte:head>
	<title>{editingExisting ? `Editar — ${slug}` : 'Novo Documento'}</title>
</svelte:head>

<svelte:window onkeydown={onGlobalKey} />

<div class="editor-shell">
	<header class="top-bar">
		<div class="brand">
			<BrandLogo height={24} />
			<span class="brand-sep">/</span>
			<a class="crumb" href="/">{data.ws.name}</a>
			<span class="brand-sep">›</span>
			<span class="slug-crumb">
				<span class="slug-prefix">/</span>
				<input
					class="slug-input"
					type="text"
					placeholder="nome-do-documento"
					bind:value={slug}
					spellcheck="false"
				/>
			</span>
		</div>

		<div class="spacer"></div>

		<div
			class="autosave"
			class:is-saving={saving}
			class:is-saved={saveStatus.kind === 'saved'}
			class:is-flash={savedFlash}
		>
			{#if savedFlash}
				<svg class="autosave-tick" width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<span class="autosave-label">Salvo</span>
			{:else}
				<span class="autosave-label">{saveStatus.label}</span>
			{/if}
		</div>

		<div class="header-actions">
			<button
				type="button"
				class="ai-toggle"
				class:is-active={aiDock.open}
				onclick={toggleAi}
				title="Assistente IA (⌘J)"
				aria-label="Abrir assistente"
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5.5 13v-1.5H3A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
					<path d="M5.2 7.2h.01M8 7.2h.01M10.8 7.2h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
				</svg>
			</button>
			{#if editingExisting}
				<a
					href="/w/{wsId}/{originalSlug}"
					class="view-btn"
					title="Ver documento publicado"
				>↗ Ver</a>
				<div class="editor-extras" class:menu-open={editorMenuOpen}>
					<button class="extras-btn" onclick={() => (historyOpen = !historyOpen)} title="Histórico de versões">
						⏱ {history.length}
					</button>
					<button class="extras-btn danger" onclick={deleteDoc}>Excluir</button>
				</div>
				<button
					class="menu-toggle"
					onclick={() => (editorMenuOpen = !editorMenuOpen)}
					aria-label="Mais ações"
					aria-expanded={editorMenuOpen}
				>⋯</button>
			{/if}
			<button class="save-btn" class:is-flash={savedFlash} onclick={save} disabled={saving}>
				{#if savedFlash}
					<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					Salvo
				{:else}
					{saving ? 'Salvando…' : 'Salvar'}
				{/if}
			</button>
		</div>
		<UserMenu />
	</header>

	<div class="sub-bar">
		<span class="stat">{wordCount} palavras</span>
		<span class="sep">·</span>
		<span class="stat">{readMinutes} min de leitura</span>
		<div class="spacer"></div>
		<span class="hint">
			<kbd>⌘S</kbd> salvar
		</span>
	</div>

	{#if error}
		<div class="error-banner">{error}</div>
	{/if}

	{#if historyOpen && history.length > 0}
		<div class="history-panel">
			<p class="history-label">Versões salvas</p>
			<ul class="history-list">
				{#each history as entry}
					<li>
						<span class="history-date">{entry.label}</span>
						<button class="restore-btn" onclick={() => restore(entry.timestamp, entry.label)} disabled={restoring}>
							Restaurar
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div class="mobile-tabs" role="tablist">
		<button
			class="mobile-tab"
			class:active={mobilePane === 'editor'}
			role="tab"
			aria-selected={mobilePane === 'editor'}
			onclick={() => (mobilePane = 'editor')}
		>Editor</button>
		<button
			class="mobile-tab"
			class:active={mobilePane === 'preview'}
			role="tab"
			aria-selected={mobilePane === 'preview'}
			onclick={() => (mobilePane = 'preview')}
		>Visualização</button>
	</div>

	<div class="workspace" class:show-editor={mobilePane === 'editor'} class:show-preview={mobilePane === 'preview'}>
		<div class="pane pane-editor">
			<div class="pane-label">
				<span class="dot" aria-hidden="true"></span>
				<span>Fonte</span>
				<div class="pane-actions">
					<button class="ai-edit-btn" onclick={openAiEdit} title="Editar seleção com AI (selecione o texto primeiro)">
						✦ AI
					</button>
					<button class="attach-btn" onclick={triggerFilePicker} disabled={uploading} title="Anexar arquivo">
						{uploading ? '↑ Enviando…' : 'Anexar'}
					</button>
				</div>
			</div>

			{#if aiEditOpen}
				<div class="ai-edit-bar">
					<span class="ai-edit-label">✦</span>
					<input
						class="ai-edit-input"
						bind:this={aiInstructionEl}
						bind:value={aiInstruction}
						onkeydown={handleAiKeydown}
						placeholder="Ex: torne mais formal, traduza para inglês, resuma…"
						disabled={aiEditing}
					/>
					<button class="ai-edit-apply" onclick={runAiEdit} disabled={aiEditing || !aiInstruction.trim()}>
						{#if aiEditing}
							<span class="ai-edit-spinner"></span>
						{:else}
							Aplicar
						{/if}
					</button>
					<button class="ai-edit-close" onclick={closeAiEdit} disabled={aiEditing}>✕</button>
					{#if aiEditError}
						<span class="ai-edit-error">{aiEditError}</span>
					{/if}
				</div>
			{/if}

			<div class="editor-container" class:drag-over={dragOver} bind:this={editorContainer}></div>
		</div>

		<div class="pane pane-preview">
			<div class="pane-label">
				<span class="dot" aria-hidden="true"></span>
				<span>Pré-visualização</span>
				<div class="pane-actions">
					<span class="preview-title">{previewTitle}</span>
				</div>
			</div>
			<div class="preview-scroll">
				<article class="doc-body prose">
					{@html previewHtml}
				</article>
			</div>
		</div>
	</div>
</div>


<style>
	.editor-shell {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-rows: 48px 32px 1fr;
		background: var(--bg);
		color: var(--ink);
		font-family: var(--font-sans);
	}

	/* ══════════════════════════════════════
	   Top bar
	═══════════════════════════════════════ */
	.top-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		background: var(--bg-deep);
		border-bottom: 1px solid var(--rule);
		color: var(--ink-soft);
		font-size: 13px;
		min-width: 0;
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 10px;
		min-width: 0;
		flex: 0 1 auto;
		overflow: hidden;
	}

	.brand-sep { color: var(--ink-muted); font-family: var(--font-serif-display); }

	.crumb {
		color: var(--ink-soft);
		font-family: var(--font-sans);
		font-size: 13px;
	}

	.crumb:hover { color: var(--ink); }

	.slug-crumb {
		display: inline-flex;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 2px 8px;
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--ink);
	}

	.slug-prefix { color: var(--ink-muted); margin-right: 2px; }

	.slug-input {
		background: none;
		border: 0;
		outline: 0;
		color: var(--ink);
		font: inherit;
		min-width: 180px;
		padding: 0;
	}

	.slug-input::placeholder { color: var(--ink-muted); }

	.spacer { flex: 1; }

	.autosave {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--ink-muted);
		padding: 0 4px;
		transition: color 0.18s;
	}

	.autosave.is-flash {
		color: oklch(0.65 0.18 150);
		animation: autosaveFlash 1.4s ease-out;
	}

	.autosave-tick {
		flex-shrink: 0;
		color: currentColor;
		animation: tickPop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}

	@keyframes autosaveFlash {
		0% { transform: scale(1); }
		18% { transform: scale(1.04); }
		40% { transform: scale(1); }
	}

	@keyframes tickPop {
		from { transform: scale(0.2); opacity: 0; }
		to { transform: scale(1); opacity: 1; }
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.editor-extras {
		display: inline-flex;
		gap: 4px;
	}

	.extras-btn,
	.view-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 30px;
		padding: 0 10px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--ink-soft);
		font-size: 12.5px;
		font-family: var(--font-sans);
		cursor: pointer;
		white-space: nowrap;
		text-decoration: none;
	}

	.extras-btn:hover,
	.view-btn:hover {
		background: var(--surface);
		border-color: var(--rule);
		color: var(--ink);
	}

	.extras-btn.danger { color: oklch(0.55 0.18 25); }
	:global([data-theme='dark']) .extras-btn.danger { color: oklch(0.75 0.15 25); }
	.extras-btn.danger:hover { border-color: oklch(0.55 0.18 25); }

	.ai-toggle {
		display: inline-grid;
		place-items: center;
		width: 30px;
		height: 30px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.ai-toggle:hover {
		background: var(--surface);
		border-color: var(--rule);
		color: var(--ink);
	}

	.ai-toggle.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
		border-color: transparent;
	}

	.menu-toggle {
		display: none;
		height: 30px;
		width: 30px;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--ink-soft);
		font-size: 18px;
		line-height: 0;
		cursor: pointer;
	}

	.menu-toggle:hover { background: var(--surface); border-color: var(--rule); }

	.save-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 16px;
		background: var(--accent);
		color: #fff;
		border: 1px solid var(--accent);
		border-radius: 6px;
		font-size: 12.5px;
		font-weight: 500;
		font-family: var(--font-sans);
		cursor: pointer;
		transition: background 0.18s, border-color 0.18s, transform 0.18s;
	}

	.save-btn:hover:not(:disabled) { filter: brightness(1.08); }
	.save-btn:disabled { opacity: 0.65; cursor: not-allowed; }

	.save-btn.is-flash {
		background: oklch(0.62 0.18 150);
		border-color: oklch(0.62 0.18 150);
		animation: saveBtnPulse 0.6s ease-out;
	}

	@keyframes saveBtnPulse {
		0% { box-shadow: 0 0 0 0 color-mix(in oklab, oklch(0.62 0.18 150) 55%, transparent); }
		100% { box-shadow: 0 0 0 10px color-mix(in oklab, oklch(0.62 0.18 150) 0%, transparent); }
	}

	/* ══════════════════════════════════════
	   Sub bar — stats
	═══════════════════════════════════════ */
	.sub-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 16px;
		background: var(--bg);
		border-bottom: 1px solid var(--rule);
		color: var(--ink-muted);
		font-family: var(--font-mono);
		font-size: 11px;
	}

	.sub-bar .stat { padding: 0 2px; }
	.sub-bar .sep { color: var(--rule); }
	.sub-bar .hint { color: var(--ink-muted); display: inline-flex; gap: 6px; align-items: center; }
	.sub-bar kbd {
		font-family: var(--font-sans);
		font-size: 10px;
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		padding: 1px 5px;
		border-radius: 3px;
		color: var(--ink-soft);
	}

	/* ══════════════════════════════════════
	   Workspace split
	═══════════════════════════════════════ */
	.workspace {
		display: grid;
		grid-template-columns: 1fr 1fr;
		min-height: 0;
		overflow: hidden;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}

	.pane-editor {
		border-right: 1px solid var(--rule);
		background: var(--ed-bg);
	}

	.pane-preview {
		background: var(--bg);
	}

	.pane-label {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 28px;
		padding: 0 14px;
		border-bottom: 1px solid var(--rule);
		color: var(--ink-muted);
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: var(--bg-deep);
		flex-shrink: 0;
	}

	.pane-label .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
	}

	.pane-label .pane-actions {
		margin-left: auto;
		display: flex;
		gap: 4px;
		align-items: center;
	}

	.pane-label .pane-actions button {
		border: 0;
		background: transparent;
		color: var(--ink-muted);
		height: 22px;
		padding: 0 8px;
		font-size: 10.5px;
		border-radius: 3px;
		letter-spacing: 0.08em;
		cursor: pointer;
		font-family: var(--font-sans);
		text-transform: uppercase;
		font-weight: 600;
	}

	.pane-label .pane-actions button:hover:not(:disabled) {
		background: var(--surface);
		color: var(--ink);
	}

	.pane-label .pane-actions button:disabled { opacity: 0.5; cursor: not-allowed; }

	.preview-title {
		color: var(--ink-soft);
		text-transform: none;
		letter-spacing: normal;
		font-size: 11px;
		font-family: var(--font-sans);
		font-weight: 400;
		max-width: 240px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Editor container — CodeMirror paints its own backgrounds. */
	.editor-container {
		flex: 1;
		min-height: 0;
		position: relative;
	}

	.editor-container.drag-over::before {
		content: 'Solte para anexar';
		position: absolute;
		inset: 12px;
		border: 2px dashed var(--accent);
		border-radius: 8px;
		display: grid;
		place-items: center;
		font-family: var(--font-sans);
		font-size: 14px;
		color: var(--accent-ink);
		background: var(--accent-soft);
		z-index: 5;
		pointer-events: none;
	}

	.preview-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 40px clamp(20px, 4vw, 56px) 120px;
	}

	/* ══════════════════════════════════════
	   Preview prose — editorial serif body
	═══════════════════════════════════════ */
	:global(.pane-preview .prose) {
		max-width: var(--reading-width);
		margin: 0 auto;
		font-family: var(--font-serif-body);
		font-size: 17px;
		line-height: 1.65;
		color: var(--ink);
	}

	:global(.pane-preview .prose h1) {
		font-family: var(--font-serif-display);
		font-size: 36px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
		margin: 0 0 14px;
		color: var(--ink);
	}

	:global(.pane-preview .prose h2) {
		font-family: var(--font-serif-display);
		font-size: 26px;
		font-weight: 500;
		letter-spacing: -0.015em;
		margin: 36px 0 14px;
		color: var(--ink);
	}

	:global(.pane-preview .prose h3) {
		font-family: var(--font-serif-display);
		font-size: 19px;
		font-weight: 600;
		margin: 24px 0 10px;
		color: var(--ink);
	}

	:global(.pane-preview .prose p) { margin: 0 0 14px; }
	:global(.pane-preview .prose ul),
	:global(.pane-preview .prose ol) { margin: 0 0 16px; padding-left: 1.3em; }
	:global(.pane-preview .prose li) { margin-bottom: 4px; }

	:global(.pane-preview .prose a) {
		color: var(--accent-ink);
		border-bottom: 1px solid var(--accent-soft);
	}

	:global(.pane-preview .prose :not(pre) > code) {
		font-family: var(--font-mono);
		font-size: 0.88em;
		padding: 1px 5px;
		background: var(--code-bg);
		border: 1px solid var(--rule-soft);
		border-radius: 3px;
		color: var(--code-ink);
	}

	:global(.pane-preview .prose pre) {
		background: var(--code-surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 14px 18px;
		margin: 16px 0;
		overflow-x: auto;
		line-height: 1.6;
	}

	:global(.pane-preview .prose pre > code) {
		font-family: var(--font-mono);
		font-size: 12.5px;
		color: var(--ink);
		background: none;
		border: 0;
		padding: 0;
	}

	:global(.pane-preview .prose blockquote) {
		margin: 16px 0;
		padding: 4px 16px;
		border-left: 3px solid var(--accent);
		color: var(--ink-soft);
		font-style: italic;
	}

	:global(.pane-preview .prose table) {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-sans);
		font-size: 13px;
		margin: 16px 0;
	}

	:global(.pane-preview .prose th),
	:global(.pane-preview .prose td) {
		padding: 6px 10px;
		border-bottom: 1px solid var(--rule-soft);
		text-align: left;
	}

	:global(.pane-preview .prose th) {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-soft);
		background: var(--bg-deep);
	}

	:global(.pane-preview .prose hr) {
		border: 0;
		border-top: 1px solid var(--rule);
		margin: 24px 0;
	}

	/* ══════════════════════════════════════
	   AI edit bar
	═══════════════════════════════════════ */
	.ai-edit-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: var(--accent-soft);
		border-bottom: 1px solid var(--rule);
		color: var(--ink);
		font-family: var(--font-sans);
		font-size: 13px;
	}

	.ai-edit-label { color: var(--accent-ink); font-size: 14px; }

	.ai-edit-input {
		flex: 1;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 5px 10px;
		font-size: 13px;
		color: var(--ink);
		font-family: inherit;
	}

	.ai-edit-input:focus { outline: 0; border-color: var(--accent); }

	.ai-edit-apply {
		background: var(--accent);
		color: #fff;
		border: 0;
		padding: 5px 12px;
		border-radius: 4px;
		font-size: 12px;
		cursor: pointer;
	}

	.ai-edit-apply:disabled { opacity: 0.6; cursor: not-allowed; }

	.ai-edit-close {
		background: transparent;
		border: 0;
		color: var(--ink-soft);
		font-size: 14px;
		cursor: pointer;
	}

	.ai-edit-spinner {
		width: 10px;
		height: 10px;
		border: 1.5px solid rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		display: inline-block;
	}

	.ai-edit-error { color: oklch(0.55 0.18 25); font-size: 11.5px; margin-left: 6px; }

	@keyframes spin { to { transform: rotate(360deg); } }

	/* ══════════════════════════════════════
	   Error banner + history panel
	═══════════════════════════════════════ */
	.error-banner {
		padding: 8px 16px;
		background: oklch(0.93 0.08 25);
		color: oklch(0.35 0.18 25);
		font-family: var(--font-sans);
		font-size: 13px;
		border-bottom: 1px solid oklch(0.85 0.1 25);
	}

	:global([data-theme='dark']) .error-banner {
		background: oklch(0.3 0.09 25);
		color: oklch(0.85 0.12 25);
		border-bottom-color: oklch(0.4 0.1 25);
	}

	.history-panel {
		padding: 10px 16px;
		background: var(--bg-deep);
		border-bottom: 1px solid var(--rule);
	}

	.history-label {
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 0 0 6px;
	}

	.history-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.history-list li {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 3px 6px 3px 8px;
		font-size: 12px;
		color: var(--ink-soft);
	}

	.history-date { font-family: var(--font-mono); font-size: 11px; }

	.restore-btn {
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: 3px;
		padding: 2px 8px;
		font-size: 11px;
		color: var(--ink-soft);
		cursor: pointer;
		font-family: var(--font-sans);
	}

	.restore-btn:hover:not(:disabled) { background: var(--bg); color: var(--ink); }
	.restore-btn:disabled { opacity: 0.6; cursor: not-allowed; }

	/* ══════════════════════════════════════
	   Mobile tabs
	═══════════════════════════════════════ */
	.mobile-tabs { display: none; }

	@media (max-width: 860px) {
		.editor-shell { grid-template-rows: auto auto auto 1fr; }
		.top-bar { flex-wrap: wrap; height: auto; padding: 8px 12px; gap: 6px; }
		.sub-bar { padding: 0 12px; }
		.slug-input { min-width: 120px; }

		.menu-toggle { display: inline-flex; }
		.editor-extras {
			display: none;
			position: absolute;
			top: 56px;
			right: 12px;
			flex-direction: column;
			gap: 2px;
			background: var(--surface);
			border: 1px solid var(--rule);
			border-radius: 6px;
			padding: 4px;
			box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.2);
			z-index: 50;
		}
		.editor-extras.menu-open { display: flex; }

		.mobile-tabs {
			display: flex;
			gap: 2px;
			padding: 6px 12px;
			background: var(--bg-deep);
			border-bottom: 1px solid var(--rule);
		}
		.mobile-tab {
			flex: 1;
			height: 30px;
			background: transparent;
			border: 1px solid var(--rule);
			border-radius: 5px;
			color: var(--ink-soft);
			font-size: 12px;
			font-family: var(--font-sans);
			cursor: pointer;
		}
		.mobile-tab.active {
			background: var(--surface);
			color: var(--ink);
			font-weight: 500;
		}

		.workspace { grid-template-columns: 1fr; }
		.pane-editor { display: none; border-right: 0; }
		.pane-preview { display: none; }
		.workspace.show-editor .pane-editor { display: flex; }
		.workspace.show-preview .pane-preview { display: flex; }
	}

	/* ══════════════════════════════════════
	   Mobile bottom nav — same pattern as home and viewer. The editor
	   header gets too crowded on narrow viewports; actions move to a
	   fixed bar at the bottom. Slug input stays in the top bar because
	   it's central to the editing task.
	═══════════════════════════════════════ */
	@media (max-width: 640px) {
		/* Brand collapses to just the logo — no "Docs" text, no
		   breadcrumb path. Slug input sits alongside the brand in a
		   full-width row. */
		.brand { gap: 6px; flex-wrap: nowrap; }
		.crumb, .brand-sep { display: none; }
		.slug-crumb { flex: 1; min-width: 0; }
		.slug-input { min-width: 0; width: 100%; }

		.autosave { display: none; }

		.header-actions {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
			background: var(--bg);
			border-top: 1px solid var(--rule);
			justify-content: space-around;
			gap: 4px;
			z-index: 40;
			box-shadow: 0 -12px 24px -16px rgba(0, 0, 0, 0.12);
		}

		/* The extras menu still exists for secondary actions but its
		   absolute positioning needs rebasing against the bottom nav. */
		.editor-extras {
			top: auto;
			bottom: 54px;
			right: 12px;
		}

		.workspace { padding-bottom: 62px; }
	}
</style>
