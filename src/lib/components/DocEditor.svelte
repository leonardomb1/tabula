<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import SourceEditor from './SourceEditor.svelte';
	import * as m from '$lib/paraglide/messages';

	interface Initial {
		title: string;
		tags: string[];
		mode: 'markdown' | 'typst';
		source: string;
	}

	let {
		workspaceId,
		initial,
		action,
		submitLabel,
		cancelHref,
		error = null,
		children
	}: {
		workspaceId: string;
		initial: Initial;
		action: string;
		submitLabel: string;
		cancelHref: string;
		error?: string | null;
		children?: import('svelte').Snippet;
	} = $props();

	const seed = untrack(() => initial);
	let title = $state(seed.title);
	let tags = $state(seed.tags.join(', '));
	let mode = $state<'markdown' | 'typst'>(seed.mode);
	let source = $state(seed.source);

	let showPreview = $state(true);
	let previewHtml = $state('');
	let previewError = $state<string | null>(null);
	let previewing = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let token = 0;

	async function render(mine: number) {
		try {
			const res = await fetch('/api/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workspaceId, mode, source })
			});
			const body = await res.json();
			if (mine !== token) return;
			previewError = body.error ?? null;
			previewHtml = body.html ?? '';
		} catch {
			if (mine === token) previewError = 'preview failed';
		} finally {
			if (mine === token) previewing = false;
		}
	}

	function schedulePreview() {
		if (!showPreview) return;
		clearTimeout(timer);
		previewing = true;
		const mine = ++token;
		timer = setTimeout(() => render(mine), mode === 'typst' ? 500 : 250);
	}

	onMount(schedulePreview);

	function togglePreview() {
		showPreview = !showPreview;
		if (showPreview) schedulePreview();
	}

	async function uploadImage(file: File): Promise<{ url: string; filename: string } | null> {
		const body = new FormData();
		body.append('file', file, file.name || 'pasted.png');
		const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/attachments`, {
			method: 'POST',
			body
		});
		if (!res.ok) return null;
		return (await res.json()) as { url: string; filename: string };
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
			event.preventDefault();
			formEl?.requestSubmit();
		}
	}

	let saving = $state(false);
</script>

<svelte:window onkeydown={onKeydown} />

<form
	bind:this={formEl}
	class="editor"
	method="POST"
	{action}
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update();
			saving = false;
		};
	}}
>
	<header class="bar">
		<input
			class="title"
			name="title"
			bind:value={title}
			placeholder={m.editor_title_label()}
			autocomplete="off"
			required
		/>
		<div class="actions">
			{@render children?.()}
			<a class="btn" href={cancelHref}>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
				{m.doc_cancel()}
			</a>
			<button class="btn primary" type="submit" disabled={saving}>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m5 12.5 4.5 4.5L19 7" />
				</svg>
				{saving ? m.doc_saving() : submitLabel}
			</button>
		</div>
	</header>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	<div class="meta">
		<label class="field grow">
			<span class="field-label">{m.editor_tags_label()}</span>
			<input name="tags" bind:value={tags} placeholder={m.editor_tags_hint()} autocomplete="off" />
		</label>

		<input type="hidden" name="mode" value={mode} />
		{#if mode === 'typst'}
			<span class="legacy" title={m.editor_legacy_typst()}>{m.editor_legacy_typst()}</span>
		{/if}


		<button
			type="button"
			class="toggle-btn"
			class:on={showPreview}
			aria-pressed={showPreview}
			aria-label={showPreview ? m.editor_preview_hide() : m.editor_preview()}
			onclick={togglePreview}
		>
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M3 5h8v14H3zM13 5h8v14h-8z" />
			</svg>
			<span>{m.editor_preview()}</span>
		</button>
	</div>

	<div class="panes" class:split={showPreview}>
		<div class="source" class:enhanced={browser}>
			{#if browser}
				<SourceEditor
					bind:value={source}
					onchange={schedulePreview}
					ariaLabel={m.editor_source_label()}
					onuploadimage={mode === 'markdown' ? uploadImage : undefined}
				/>
			{/if}
			<textarea
				name="source"
				bind:value={source}
				oninput={schedulePreview}
				spellcheck="false"
				aria-label={m.editor_source_label()}
				aria-hidden={browser}
				tabindex={browser ? -1 : 0}
			></textarea>
		</div>

		{#if showPreview}
			<div class="preview">
				{#if previewError}
					<pre class="preview-error">{previewError}</pre>
				{:else if previewing && !previewHtml}
					<p class="pending">{m.preview_pending()}</p>
				{:else if mode === 'typst'}
					<div class="typst">{@html previewHtml}</div>
				{:else}
					<div class="prose">{@html previewHtml}</div>
				{/if}
			</div>
		{/if}
	</div>
</form>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		padding: 16px 20px 20px;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.title {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.015em;
		font-variation-settings: 'opsz' 48;
		outline: none;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 13px;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn svg {
		flex: none;
	}
	.btn:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.btn.primary {
		background: var(--brand);
		border-color: transparent;
		color: #fff;
		font-weight: 600;
	}
	.btn.primary:disabled {
		opacity: 0.6;
	}

	.error {
		margin: 10px 0 0;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 13px;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
		margin-top: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.field.grow {
		flex: 1;
		max-width: 420px;
	}

	.field-label {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.field input {
		height: 30px;
		width: 100%;
		padding: 0 9px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 13px;
	}
	.field input:hover {
		border-color: var(--border-strong);
	}

	.legacy {
		display: inline-flex;
		align-items: center;
		height: 30px;
		padding: 0 10px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-sm);
		font-size: 12px;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text-muted);
		font-size: 12.5px;
		cursor: pointer;
		white-space: nowrap;
	}
	.toggle-btn:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}
	.toggle-btn.on {
		background: var(--surface-active);
		color: var(--text);
	}

	.panes {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 1fr;
		gap: 14px;
		margin-top: 10px;
	}
	.panes.split {
		grid-template-columns: 1fr 1fr;
	}

	.source {
		min-height: 0;
		height: 100%;
	}

	textarea {
		width: 100%;
		height: 100%;
		resize: none;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-family: var(--font-mono);
		font-size: 13.5px;
		line-height: 1.65;
		outline: none;
		tab-size: 2;
	}
	textarea:focus {
		border-color: var(--border-strong);
	}
	.source.enhanced textarea {
		display: none;
	}

	.preview {
		overflow-y: auto;
		padding: 14px 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}

	.pending {
		color: var(--text-faint);
		font-size: 13px;
	}

	.preview-error {
		margin: 0;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 12px;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.typst :global(svg) {
		max-width: 100%;
		height: auto;
	}

	.prose {
		font-family: var(--font-read);
		font-size: 16px;
		line-height: 1.65;
	}
	.prose :global(:is(h1, h2, h3)) {
		font-family: var(--font-display);
		font-weight: 600;
		line-height: 1.25;
		margin: 1.6em 0 0.5em;
	}
	.prose :global(h1) {
		font-size: 1.5em;
	}
	.prose :global(h2) {
		font-size: 1.28em;
	}
	.prose :global(a) {
		color: var(--brand);
		text-decoration: underline;
	}
	.prose :global(:is(ul, ol)) {
		padding-inline-start: 1.3em;
	}
	.prose :global(blockquote) {
		margin: 1.2em 0;
		padding-inline-start: 0.9em;
		border-inline-start: 3px solid var(--brand);
		color: var(--text-muted);
	}
	.prose :global(code) {
		font-family: var(--font-mono);
		font-size: 0.87em;
		padding: 0.12em 0.35em;
		border-radius: 4px;
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.prose :global(pre) {
		padding: 12px 14px;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: 13px;
	}
	.prose :global(pre code) {
		padding: 0;
		border: 0;
		background: none;
	}
	.prose :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 13.5px;
	}
	.prose :global(:is(th, td)) {
		padding: 6px 9px;
		border: 1px solid var(--border);
		text-align: start;
	}
	.prose :global(img),
	.prose :global(svg) {
		max-width: 100%;
		height: auto;
	}
	.prose :global(.typst-figure) {
		margin: 1.4em 0;
		overflow-x: auto;
	}
	.prose :global(.typst-figure img) {
		display: block;
		margin: 0 auto;
	}

	@media (max-width: 900px) {
		.panes.split {
			grid-template-columns: 1fr;
		}
	}
</style>
