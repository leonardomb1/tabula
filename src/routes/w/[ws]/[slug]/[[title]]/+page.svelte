<script lang="ts">
	import type { PageData } from './$types';
	import TopBar from '$lib/TopBar.svelte';
	import PdfPreviewModal from '$lib/PdfPreviewModal.svelte';
	import DocReader from '$lib/DocReader.svelte';
	import { aiDock, toggleAi } from '$lib/aiDock.svelte';
	import { goto } from '$app/navigation';
	import { ROLES, isAtLeast } from '$lib/roles';

	let { data }: { data: PageData } = $props();

	const canWrite = $derived(isAtLeast(data.role, ROLES.EDITOR));

	let previewOpen = $state(false);
	let copied = $state(false);

	function copyPublicLink() {
		navigator.clipboard.writeText(`${location.origin}/public/${data.slug}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function deleteDoc() {
		const label = data.title && data.title !== 'Untitled' ? data.title : data.slug;
		if (!confirm(`Excluir "${label}"? Esta ação não pode ser desfeita.`)) return;
		const res = await fetch(`/api/delete/${data.slug}?ws=${data.ws.id}`, { method: 'DELETE' });
		if (res.ok) goto('/');
	}
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="atelier">
	<TopBar ws={data.ws} pageHeadings={data.toc}>
		{#snippet actions()}
			<button
				type="button"
				class="action-btn icon-btn"
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
			<a
				href="/api/export/{data.slug}?format=md&ws={data.ws.id}"
				class="action-btn icon-btn"
				download
				title="Baixar Markdown"
				aria-label="Baixar Markdown"
			>
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M3 3h6.5L13 6.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
					<text x="8" y="11.5" text-anchor="middle" font-size="4.2" font-weight="700" fill="currentColor" font-family="var(--font-sans)">MD</text>
				</svg>
			</a>
			<a
				href="/api/export/{data.slug}?format=html&ws={data.ws.id}"
				class="action-btn icon-btn"
				download
				title="Baixar HTML"
				aria-label="Baixar HTML"
			>
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M3 3h6.5L13 6.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
					<path d="m6 10-1-1 1-1M10 8l1 1-1 1M7.8 11 8.6 8" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</a>
			{#if data.frontmatter.public}
				<button
					type="button"
					class="action-btn icon-btn"
					class:is-copied={copied}
					onclick={copyPublicLink}
					title={copied ? 'Link copiado' : 'Copiar link público'}
					aria-label={copied ? 'Link copiado' : 'Copiar link público'}
				>
					{#if copied}
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M3 8.5l3.2 3.2L13 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{:else}
						<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M8 2v9m0-9-2.5 2.5M8 2l2.5 2.5M3.5 9.5v3a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
				</button>
			{/if}
			{#if data.frontmatter.formal}
				<button
					type="button"
					class="action-btn icon-btn"
					onclick={() => (previewOpen = true)}
					title="Exportar PDF"
					aria-label="Exportar PDF"
				>
					<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M3 3h6.5L13 6.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
						<text x="8" y="11.5" text-anchor="middle" font-size="4.2" font-weight="700" fill="currentColor" font-family="var(--font-sans)">PDF</text>
					</svg>
				</button>
			{/if}
			{#if canWrite}
				<button
					type="button"
					class="action-btn icon-btn danger"
					onclick={deleteDoc}
					title="Excluir documento"
					aria-label="Excluir documento"
				>
					<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M3 4h10M6 4V2.5h4V4M4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
				<a href="/new?edit={data.slug}&ws={data.ws.id}" class="action-btn primary">Editar</a>
			{/if}
		{/snippet}
	</TopBar>

	<DocReader
		doc={{
			title: data.title,
			html: data.html,
			toc: data.toc,
			frontmatter: data.frontmatter,
			mtime: data.mtime,
			wordCount: data.wordCount,
			readMinutes: data.readMinutes
		}}
		citedRefs={data.citedRefs}
		backlinks={data.backlinks}
		wsId={data.ws.id}
		mobileActions={mobileActionsSnippet}
	/>
</div>

{#snippet mobileActionsSnippet()}
	{#if canWrite}
		<a href="/new?edit={data.slug}&ws={data.ws.id}" class="sheet-action">
			<span class="sheet-action__icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11 2.5 13.5 5 5 13.5H2.5V11L11 2.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
			</span>
			<span class="sheet-action__meta">
				<span class="sheet-action__label">Editar</span>
				<span class="sheet-action__hint">Abre o editor</span>
			</span>
		</a>
	{/if}
	{#if data.frontmatter.formal}
		<button type="button" class="sheet-action" onclick={() => (previewOpen = true)}>
			<span class="sheet-action__icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0-3-3m3 3 3-3M2.5 11.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</span>
			<span class="sheet-action__meta">
				<span class="sheet-action__label">Exportar PDF</span>
				<span class="sheet-action__hint">Visualização otimizada p/ impressão</span>
			</span>
		</button>
	{/if}
	<button type="button" class="sheet-action" onclick={toggleAi}>
		<span class="sheet-action__icon" aria-hidden="true">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5.5 13v-1.5H3A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.2 7.2h.01M8 7.2h.01M10.8 7.2h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
		</span>
		<span class="sheet-action__meta">
			<span class="sheet-action__label">Assistente IA</span>
			<span class="sheet-action__hint">Perguntar sobre este documento</span>
		</span>
	</button>
	{#if data.frontmatter.public}
		<button type="button" class="sheet-action" onclick={copyPublicLink}>
			<span class="sheet-action__icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 10 10 6M5 10.5 3 8.5a2 2 0 1 1 2.8-2.8l1 1M11 5.5l1-1a2 2 0 1 1 2.8 2.8l-2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
			</span>
			<span class="sheet-action__meta">
				<span class="sheet-action__label">{copied ? 'Link copiado' : 'Copiar link público'}</span>
				<span class="sheet-action__hint">/public/{data.slug}</span>
			</span>
		</button>
	{/if}
	<a href="/api/export/{data.slug}?format=md&ws={data.ws.id}" class="sheet-action" download>
		<span class="sheet-action__icon" aria-hidden="true">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3h7l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
		</span>
		<span class="sheet-action__meta">
			<span class="sheet-action__label">Baixar Markdown</span>
		</span>
	</a>
	{#if canWrite}
		<button type="button" class="sheet-action" onclick={deleteDoc}>
			<span class="sheet-action__icon" aria-hidden="true" style="color: var(--danger, #b7342c)">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2.5h4V4M4 4v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</span>
			<span class="sheet-action__meta">
				<span class="sheet-action__label" style="color: var(--danger, #b7342c)">Excluir documento</span>
			</span>
		</button>
	{/if}
{/snippet}

<PdfPreviewModal
	open={previewOpen}
	slug={data.slug}
	wsId={data.ws.id}
	onClose={() => (previewOpen = false)}
/>

<style>
	.atelier {
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
	}

	/* Top bar chrome (sticky, frosted, brand slot, workspace pill, search
	   positioning, auto-hide, mobile grid collapse) lives in
	   $lib/TopBar.svelte. The styles below decorate the action snippet's
	   buttons — they intentionally stay page-scoped so tweaks here don't
	   bleed into the dashboard's cluster. */
	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 10px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		font-size: 13px;
		color: var(--ink-soft);
		font-family: var(--font-sans);
	}

	.action-btn:hover {
		background: var(--surface);
		border-color: var(--rule);
		color: var(--ink);
	}

	.action-btn.primary {
		background: var(--ink);
		color: var(--bg);
		border-color: var(--ink);
	}

	.action-btn.primary:hover {
		background: oklch(0.3 0.015 80);
		border-color: transparent;
	}

	.action-btn.icon-btn {
		width: 32px;
		padding: 0;
		justify-content: center;
	}

	.action-btn.icon-btn.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
		border-color: transparent;
	}

	/* Icon-only variants of action-btn — used for the navbar cluster that
	   replaced the old kebab dropdown (Markdown, HTML, share, delete). */
	.action-btn.danger {
		color: oklch(0.55 0.18 25);
	}
	:global([data-theme='dark']) .action-btn.danger {
		color: oklch(0.78 0.16 25);
	}
	.action-btn.danger:hover {
		background: oklch(0.95 0.03 25);
		color: oklch(0.4 0.22 25);
	}
	:global([data-theme='dark']) .action-btn.danger:hover {
		background: oklch(0.25 0.05 25);
	}

	/* Share button briefly morphs into a ✓ while the clipboard copy is
	   fresh. The color shift + background nudge make it unmistakable;
	   the icon swap happens in markup (checkmark vs tray). */
	.action-btn.is-copied {
		color: var(--accent-ink);
		background: var(--accent-soft);
		border-color: transparent;
	}

</style>
