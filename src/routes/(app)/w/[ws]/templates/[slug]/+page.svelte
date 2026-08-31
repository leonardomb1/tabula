<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { onMount, untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import SourceEditor from '$lib/components/SourceEditor.svelte';
	import TypstPreview from '$lib/components/TypstPreview.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ws = $derived(page.params.ws ?? '');
	let name = $state(untrack(() => data.template.name));
	let source = $state(untrack(() => data.template.source));
	let saving = $state(false);

	let showPreview = $state(true);
	let previewSvg = $state('');
	let previewPages = $state(1);
	let previewError = $state<string | null>(null);
	let previewing = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let token = 0;

	async function render(mine: number) {
		try {
			const res = await fetch('/api/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ workspaceId: ws, templateSource: source })
			});
			const body = await res.json();
			if (mine !== token) return;
			previewError = body.error ?? null;
			previewSvg = body.svg ?? '';
			previewPages = body.pages ?? 1;
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
		timer = setTimeout(() => render(mine), 500);
	}

	onMount(schedulePreview);

	function togglePreview() {
		showPreview = !showPreview;
		if (showPreview) schedulePreview();
	}
</script>

<svelte:head>
	<title>{data.template.name}</title>
</svelte:head>

<form
	class="editor"
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update();
			saving = false;
		};
	}}
>
	<header>
		<input class="title" name="name" bind:value={name} autocomplete="off" required />
		<div class="actions">
			<a class="btn" href="/w/{ws}/templates">
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
				{m.doc_cancel()}
			</a>
			<button
				class="btn danger"
				type="submit"
				formaction="?/delete"
				formnovalidate
				onclick={(e) => {
					if (!confirm(m.template_delete_confirm())) e.preventDefault();
				}}
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
				</svg>
				{m.doc_delete()}
			</button>
			<button class="btn primary" type="submit" disabled={saving}>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m5 12.5 4.5 4.5L19 7" />
				</svg>
				{saving ? m.doc_saving() : m.doc_save()}
			</button>
		</div>
	</header>

	<div class="meta">
		<p class="hint">{m.template_inputs_hint()}</p>
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
					ariaLabel={m.template_source()}
					language="typst"
					inputKeys={data.inputKeys}
				/>
			{/if}
			<textarea
				name="source"
				bind:value={source}
				oninput={schedulePreview}
				spellcheck="false"
				aria-label={m.template_source()}
				aria-hidden={browser}
				tabindex={browser ? -1 : 0}
			></textarea>
		</div>

		{#if showPreview}
			<div class="preview" class:paged={!previewError && !!previewSvg} class:refreshing={previewing && !!(previewSvg || previewError)}>
				{#if previewing && !!(previewSvg || previewError)}
					<div class="preview-refresh" aria-hidden="true"><span class="spin"></span></div>
				{/if}
				{#if previewError}
					<pre class="preview-error">{previewError}</pre>
				{:else if previewing && !previewSvg}
					<p class="pending">{m.preview_pending()}</p>
				{:else if previewSvg}
					<div class="preview-body">
						<TypstPreview svg={previewSvg} pages={previewPages} />
					</div>
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

	header {
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
		font-size: 22px;
		font-weight: 600;
		font-variation-settings: 'opsz' 42;
		outline: none;
	}

	.actions {
		display: flex;
		gap: 8px;
		flex: none;
	}

	.btn {
		height: 30px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 13px;
		cursor: pointer;
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
	.btn.danger:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.btn svg {
		flex: none;
	}

	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 10px 0;
	}

	.hint {
		margin: 0;
		font-size: 11.5px;
		color: var(--text-faint);
		font-family: var(--font-mono);
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
	}
	.panes.split {
		grid-template-columns: 1fr 1fr;
	}

	.source {
		min-height: 0;
		height: 100%;
	}

	.preview {
		position: relative;
		overflow-y: auto;
		padding: 14px 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	.preview.paged {
		padding: 0;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.preview-body {
		transition: opacity 120ms ease;
	}
	.paged .preview-body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.refreshing :is(.preview-body, .preview-error) {
		opacity: 0.45;
		pointer-events: none;
	}

	.preview-refresh {
		position: sticky;
		top: 0;
		z-index: 2;
		height: 0;
		display: flex;
		justify-content: center;
	}
	.spin {
		margin-top: 12px;
		width: 18px;
		height: 18px;
		border: 2px solid var(--border-strong);
		border-top-color: var(--brand);
		border-radius: 50%;
		animation: preview-spin 0.7s linear infinite;
	}
	@keyframes preview-spin {
		to {
			transform: rotate(360deg);
		}
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

	@media (max-width: 900px) {
		.panes.split {
			grid-template-columns: 1fr;
		}
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
	}
	.source.enhanced textarea {
		display: none;
	}
</style>
