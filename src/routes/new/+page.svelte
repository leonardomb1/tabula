<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import UserMenu from '$lib/UserMenu.svelte';
	import type { PageData } from './$types';

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
	// Set on first visit by the index page when clicking "+ Novo" or via the
	// workspace pill, and on Edit clicks from /w/<ws>/<slug>.
	const wsId = $derived($page.url.searchParams.get('ws') ?? 'default');

	let slug = $state('');
	let originalSlug = $state('');
	let content = $state(STARTER);
	let previewHtml = $state('');
	let previewTitle = $state('');
	let saving = $state(false);
	let error = $state('');
	let debounceTimer: ReturnType<typeof setTimeout>;
	let editingExisting = $state(false);
	let mobilePane = $state<'editor' | 'preview'>('editor');
	let editorMenuOpen = $state(false);

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

	// CodeMirror
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
		await mermaid.run({ querySelector: '.mermaid' });
	}

	async function fetchPreview() {
		const res = await fetch('/api/preview', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});
		const data = await res.json();
		previewHtml = data.html;
		previewTitle = data.title;
		await tick();
		renderMermaid();
	}

	function onContentInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(fetchPreview, 300);
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
			goto(`/w/${wsId}/${slug.trim()}`);
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

		// Remove selected text and start inserting at that position
		editorView.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } });
		let insertPos = sel.from;

		try {
			const res = await fetch('/api/ai/edit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ selectedText, instruction: aiInstruction.trim() })
			});

			if (!res.ok) {
				// Restore original text on error
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

	onMount(async () => {
		// Determine initial content
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

		// Lazy-load CodeMirror (avoids SSR issues, keeps bundle split)
		const [
			{ EditorView, keymap, drawSelection, dropCursor },
			{ EditorState },
			{ defaultKeymap, historyKeymap, indentWithTab },
			{ history: cmHistory },
			{ markdown, markdownLanguage },
			{ oneDark },
			{ languages }
		] = await Promise.all([
			import('@codemirror/view'),
			import('@codemirror/state'),
			import('@codemirror/commands'),
			import('@codemirror/commands'),
			import('@codemirror/lang-markdown'),
			import('@codemirror/theme-one-dark'),
			import('@codemirror/language-data')
		]);

		const editorTheme = EditorView.theme({
			'&': { height: '100%' },
			'.cm-scroller': { overflow: 'auto', padding: '1.5rem', fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace", fontSize: '0.9rem', lineHeight: '1.65' },
			'.cm-content': { caretColor: 'var(--brand)' },
			'.cm-cursor': { borderLeftColor: 'var(--brand)' },
			'.cm-selectionBackground': { background: '#3d4166 !important' },
			'&.cm-focused .cm-selectionBackground': { background: '#3d4166 !important' },
			'.cm-activeLineGutter': { backgroundColor: '#1e1e1e' },
			'.cm-activeLine': { backgroundColor: '#1e1e1e' },
		});

		const state = EditorState.create({
			doc: initialContent,
			extensions: [
				cmHistory(),
				drawSelection(),
				dropCursor(),
				EditorView.lineWrapping,
				keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
				markdown({ base: markdownLanguage, codeLanguages: languages }),
				oneDark,
				editorTheme,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						content = update.state.doc.toString();
						onContentInput();
					}
				}),
				EditorView.domEventHandlers({
					paste(event) {
						const file = Array.from(event.clipboardData?.files ?? []).find(f => f.type.startsWith('image/'));
						if (file) { event.preventDefault(); uploadFile(file); return true; }
						return false;
					},
					dragover(event) { event.preventDefault(); dragOver = true; return false; },
					dragleave() { dragOver = false; return false; },
					drop(event) {
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

<div class="editor-page">
	<header class="editor-header">
		<a href="/" class="back-link">← {data.ws.name}</a>

		<div class="slug-row">
			<span class="slug-prefix">/</span>
			<input
				class="slug-input"
				type="text"
				placeholder="nome-do-documento"
				bind:value={slug}
				spellcheck="false"
			/>
		</div>

		<div class="header-actions">
			{#if editingExisting}
				<div class="editor-extras" class:menu-open={editorMenuOpen}>
					<button class="history-btn" onclick={() => historyOpen = !historyOpen} title="Histórico de versões">
						⏱ {history.length}
					</button>
					<button class="delete-btn" onclick={deleteDoc}>Excluir</button>
				</div>
				<button
					class="editor-menu-toggle"
					onclick={() => (editorMenuOpen = !editorMenuOpen)}
					aria-label="Mais ações"
					aria-expanded={editorMenuOpen}
				>⋯</button>
			{/if}
			<button class="save-btn" onclick={save} disabled={saving}>
				{saving ? 'Salvando…' : 'Salvar'}
			</button>
		</div>
		<UserMenu theme="dark" />
	</header>

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

	<div class="editor-body" class:show-editor={mobilePane === 'editor'} class:show-preview={mobilePane === 'preview'}>
		<div class="pane pane-editor">
			<div class="pane-label">
				Markdown
				<button
					class="ai-edit-btn"
					onclick={openAiEdit}
					title="Editar seleção com AI (selecione o texto primeiro)"
				>
					✦ AI
				</button>
				<button class="attach-btn" onclick={triggerFilePicker} disabled={uploading} title="Anexar arquivo">
					{uploading ? '↑ Enviando…' : 'Anexar'}
				</button>
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
			<div class="pane-label">Visualização — {previewTitle}</div>
			<div class="preview-scroll">
				<article class="doc-body">
					{@html previewHtml}
				</article>
			</div>
		</div>
	</div>
</div>

<style>
	.editor-page {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
		color: #d4d4d4;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}

	/* ── Header ── */
	.editor-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1.2rem;
		background: #111;
		border-bottom: 1px solid #2a2a2a;
		flex-shrink: 0;
	}

	.back-link { color: #888; text-decoration: none; font-size: 0.82rem; white-space: nowrap; }
	.back-link:hover { color: #d4d4d4; }

	.slug-row {
		display: flex;
		align-items: center;
		flex: 1;
		background: #222;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 0 0.5rem;
	}

	.slug-prefix { color: #666; font-size: 0.9rem; font-family: ui-monospace, monospace; user-select: none; }

	.slug-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: #d4d4d4;
		font-size: 0.9rem;
		font-family: ui-monospace, monospace;
		padding: 0.35rem 0.4rem;
	}
	.slug-input::placeholder { color: #555; }

	.header-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; position: relative; }
	.editor-extras { display: contents; }
	.editor-menu-toggle { display: none; }

	.history-btn {
		background: #222; border: 1px solid #333; color: #888;
		padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem;
		cursor: pointer; white-space: nowrap; transition: all 0.15s;
	}
	.history-btn:hover { border-color: #555; color: #d4d4d4; }

	.delete-btn {
		background: none; border: 1px solid #333; color: #666;
		padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.82rem;
		cursor: pointer; transition: all 0.15s;
	}
	.delete-btn:hover { background: #3b0000; border-color: #7f1d1d; color: #fca5a5; }

	.save-btn {
		background: var(--brand); color: #fff; border: none;
		padding: 0.4rem 1.1rem; border-radius: 6px; cursor: pointer;
		font-size: 0.85rem; font-weight: 500; white-space: nowrap; transition: background 0.15s;
	}
	.save-btn:hover:not(:disabled) { background: #c42e10; }
	.save-btn:disabled { opacity: 0.6; cursor: not-allowed; }

	/* ── History ── */
	.history-panel {
		background: #161616; border-bottom: 1px solid #2a2a2a;
		padding: 0.6rem 1.2rem; flex-shrink: 0; max-height: 160px; overflow-y: auto;
	}
	.history-label { font-size: 0.68rem; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: #555; margin: 0 0 0.4rem; }
	.history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; }
	.history-list li { display: flex; align-items: center; justify-content: space-between; padding: 0.25rem 0; border-bottom: 1px solid #222; }
	.history-date { font-size: 0.8rem; color: #888; font-family: ui-monospace, monospace; }
	.restore-btn { background: none; border: 1px solid #333; color: #666; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.1s; }
	.restore-btn:hover { border-color: var(--brand); color: var(--brand); }
	.restore-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	/* ── Error ── */
	.error-banner { background: #7f1d1d; color: #fca5a5; padding: 0.5rem 1.2rem; font-size: 0.85rem; flex-shrink: 0; }

	/* ── Editor body ── */
	.editor-body { display: flex; flex: 1; overflow: hidden; }

	.pane { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
	.pane-editor { border-right: 1px solid #2a2a2a; }

	.pane-label {
		font-size: 0.7rem; font-weight: 600; letter-spacing: 0.07em;
		text-transform: uppercase; color: #555; padding: 0.4rem 1rem;
		border-bottom: 1px solid #222; flex-shrink: 0;
		display: flex; align-items: center; gap: 0.4rem;
	}

	.ai-edit-btn {
		background: none; border: 1px solid #3a2a1a; color: #c87533;
		padding: 0.18rem 0.55rem; border-radius: 4px; font-size: 0.7rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		cursor: pointer; text-transform: none; letter-spacing: 0;
		transition: all 0.15s; white-space: nowrap;
	}
	.ai-edit-btn:hover { border-color: var(--brand); color: var(--brand); background: #1e1010; }

	.attach-btn {
		margin-left: auto; background: none; border: 1px solid #333; color: #666;
		padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.72rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		cursor: pointer; text-transform: none; letter-spacing: 0; transition: all 0.15s; white-space: nowrap;
	}
	.attach-btn:hover:not(:disabled) { border-color: #555; color: #d4d4d4; }
	.attach-btn:disabled { opacity: 0.5; cursor: not-allowed; }

	/* ── AI Edit bar ── */
	.ai-edit-bar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.75rem;
		background: #141414;
		border-bottom: 1px solid #2a2a2a;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	.ai-edit-label { color: #c87533; font-size: 0.85rem; flex-shrink: 0; }

	.ai-edit-input {
		flex: 1;
		min-width: 0;
		background: #1e1e1e;
		border: 1px solid #3a3a3a;
		border-radius: 4px;
		color: #d4d4d4;
		font-size: 0.82rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		padding: 0.3rem 0.6rem;
		outline: none;
		transition: border-color 0.1s;
	}
	.ai-edit-input:focus { border-color: #c87533; }
	.ai-edit-input::placeholder { color: #555; }
	.ai-edit-input:disabled { opacity: 0.5; }

	.ai-edit-apply {
		background: #c87533; color: #fff; border: none;
		padding: 0.3rem 0.75rem; border-radius: 4px; font-size: 0.78rem;
		cursor: pointer; white-space: nowrap; transition: background 0.15s;
		display: flex; align-items: center; gap: 0.3rem; min-width: 4.5rem; justify-content: center;
	}
	.ai-edit-apply:hover:not(:disabled) { background: var(--brand); }
	.ai-edit-apply:disabled { opacity: 0.5; cursor: not-allowed; }

	.ai-edit-close {
		background: none; border: none; color: #555; cursor: pointer;
		font-size: 0.8rem; padding: 0.2rem 0.3rem; transition: color 0.1s;
	}
	.ai-edit-close:hover { color: var(--brand); }
	.ai-edit-close:disabled { opacity: 0.4; cursor: not-allowed; }

	.ai-edit-error { color: #f87171; font-size: 0.75rem; width: 100%; padding-left: 1rem; }

	.ai-edit-spinner {
		width: 12px; height: 12px;
		border: 1.5px solid rgba(255,255,255,0.35);
		border-top-color: #fff; border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── CodeMirror container ── */
	.editor-container {
		flex: 1;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: outline 0.15s;
	}

	.editor-container.drag-over {
		outline: 2px dashed #4a7c4a;
		outline-offset: -4px;
	}

	:global(.editor-container .cm-editor) {
		height: 100%;
		font-size: 0.9rem;
	}

	:global(.editor-container .cm-editor.cm-focused) {
		outline: none;
	}

	:global(.editor-container .cm-scroller) {
		font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace !important;
		line-height: 1.65 !important;
	}

	/* ── Preview pane ── */
	.preview-scroll {
		flex: 1; overflow-y: auto; background: #fffff8; padding: 2rem 2.5rem 4rem;
	}

	:global(.doc-body) {
		font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'Times New Roman', serif;
		font-size: 1.05rem; line-height: 1.75; color: #1a1a1a; max-width: 680px;
		overflow-wrap: break-word;
	}

	:global(.doc-body .table-wrap) {
		overflow-x: auto;
		max-width: 100%;
		margin: 1.4em 0;
	}
	:global(.doc-body .table-wrap table) { margin: 0; }

	:global(.doc-body h1) { font-size: 1.9rem; font-weight: 700; line-height: 1.2; margin: 0 0 0.3em; border-bottom: 1px solid #e0ddd5; padding-bottom: 0.4em; }
	:global(.doc-body h2) { font-size: 1.4rem; font-weight: 600; margin: 2em 0 0.5em; border-bottom: 1px solid #e8e5df; padding-bottom: 0.2em; }
	:global(.doc-body h3) { font-size: 1.15rem; font-weight: 600; margin: 1.7em 0 0.4em; }
	:global(.doc-body p) { margin: 0 0 1.1em; }
	:global(.doc-body a) { color: var(--brand); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--brand) 25%, transparent); }
	:global(.doc-body ul, .doc-body ol) { padding-left: 2em; margin: 0 0 1.1em; }
	:global(.doc-body li) { margin-bottom: 0.3em; }
	:global(.doc-body blockquote) { margin: 1.4em 0; padding: 0.1em 0 0.1em 1.25em; border-left: 4px solid #d1c9b0; color: #555; font-style: italic; }
	:global(.doc-body code) { font-family: ui-monospace, monospace; font-size: 0.875em; background: #f5f2eb; padding: 0.15em 0.35em; border-radius: 3px; color: #b5470d; }
	:global(.doc-body pre) { background: #1e1e1e; border-radius: 6px; padding: 1em 1.2em; overflow-x: auto; max-width: 100%; margin: 1.4em 0; }
	:global(.doc-body pre code) { background: none; padding: 0; color: #d4d4d4; font-size: 0.83rem; }
	:global(.doc-body pre.mermaid) { background: #fff; border: 1px solid #e0ddd5; padding: 1.5em; text-align: center; }
	:global(.doc-body table) { width: 100%; border-collapse: collapse; margin: 1.4em 0; font-size: 0.93em; }
	:global(.doc-body th) { background: #f5f2eb; font-weight: 600; padding: 0.45em 0.8em; border: 1px solid #d1c9b0; text-align: left; }
	:global(.doc-body td) { padding: 0.4em 0.8em; border: 1px solid #e0ddd5; }
	:global(.doc-body hr) { border: none; border-top: 1px solid #e0ddd5; margin: 2.5em 0; }

	:global(.hljs) { color: #abb2bf; }
	:global(.hljs-keyword, .hljs-selector-tag, .hljs-built_in) { color: #c678dd; }
	:global(.hljs-string, .hljs-attr) { color: #98c379; }
	:global(.hljs-number, .hljs-literal) { color: #d19a66; }
	:global(.hljs-comment) { color: #5c6370; font-style: italic; }
	:global(.hljs-title, .hljs-section) { color: #61afef; }
	:global(.hljs-type, .hljs-class) { color: #e5c07b; }
	:global(.hljs-variable, .hljs-name) { color: #e06c75; }

	/* ── Mobile tab switcher (hidden on desktop) ── */
	.mobile-tabs { display: none; }

	@media (max-width: 640px) {
		.editor-header {
			padding: 0.5rem 0.75rem;
			gap: 0.5rem;
			flex-wrap: wrap;
		}
		.back-link { font-size: 0.78rem; }
		.slug-row {
			order: 3;
			flex-basis: 100%;
			padding: 0 0.4rem;
		}
		.slug-input { font-size: 16px; padding: 0.45rem 0.4rem; }
		.header-actions { gap: 0.4rem; margin-left: auto; }
		.save-btn { padding: 0.4rem 0.9rem; font-size: 0.82rem; }

		.editor-extras { display: none; }
		.editor-extras.menu-open {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			position: absolute;
			top: calc(100% + 0.5rem);
			right: 0;
			background: #1e1e1e;
			border: 1px solid #333;
			border-radius: 8px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
			padding: 0.4rem;
			gap: 0.25rem;
			z-index: 50;
			min-width: 9rem;
		}
		.editor-extras.menu-open .history-btn,
		.editor-extras.menu-open .delete-btn {
			width: 100%;
			text-align: left;
		}
		.editor-menu-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
			background: #222;
			border: 1px solid #333;
			color: #888;
			font-size: 1rem;
			line-height: 1;
			padding: 0.35rem 0.65rem;
			border-radius: 6px;
			cursor: pointer;
			flex-shrink: 0;
		}
		.editor-menu-toggle:hover { border-color: #555; color: #d4d4d4; }

		.mobile-tabs {
			display: flex;
			background: #111;
			border-bottom: 1px solid #2a2a2a;
			flex-shrink: 0;
		}
		.mobile-tab {
			flex: 1;
			background: none;
			border: none;
			color: #666;
			padding: 0.6rem 1rem;
			font-size: 0.82rem;
			font-family: inherit;
			cursor: pointer;
			border-bottom: 2px solid transparent;
			transition: color 0.15s, border-color 0.15s;
		}
		.mobile-tab.active {
			color: #d4d4d4;
			border-bottom-color: var(--brand);
		}

		.editor-body.show-editor .pane-preview { display: none; }
		.editor-body.show-preview .pane-editor { display: none; }
		.pane-editor { border-right: none; }

		.pane-label { padding: 0.35rem 0.75rem; flex-wrap: wrap; }
		.ai-edit-bar { padding: 0.4rem 0.6rem; }
		.ai-edit-input { font-size: 16px; }

		.preview-scroll { padding: 1.25rem 1rem 3rem; }
		:global(.doc-body) { font-size: 1rem; }
		:global(.doc-body h1) { font-size: 1.5rem; }
		:global(.doc-body h2) { font-size: 1.2rem; }
		:global(.doc-body h3) { font-size: 1.05rem; }
	}
</style>
