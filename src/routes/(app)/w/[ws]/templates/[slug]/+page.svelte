<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import SourceEditor from '$lib/components/SourceEditor.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ws = $derived(page.params.ws ?? '');
	let name = $state(untrack(() => data.template.name));
	let source = $state(untrack(() => data.template.source));
	let saving = $state(false);
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

	<p class="hint">{m.template_inputs_hint()}</p>

	<div class="source" class:enhanced={browser}>
		{#if browser}
			<SourceEditor
				bind:value={source}
				ariaLabel={m.template_source()}
				language="typst"
				inputKeys={data.inputKeys}
			/>
		{/if}
		<textarea
			name="source"
			bind:value={source}
			spellcheck="false"
			aria-label={m.template_source()}
			aria-hidden={browser}
			tabindex={browser ? -1 : 0}
		></textarea>
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

	.hint {
		margin: 10px 0;
		font-size: 11.5px;
		color: var(--text-faint);
		font-family: var(--font-mono);
	}

	.source {
		flex: 1;
		min-height: 0;
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
