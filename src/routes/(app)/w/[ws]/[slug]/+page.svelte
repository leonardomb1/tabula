<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getLocale } from '$lib/paraglide/runtime';
	import { docHref, editHref, historyHref, workspaceHref } from '$lib/nav';
	import ExportDialog from '$lib/components/ExportDialog.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import { formatDate } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const locale = $derived(getLocale());
	const wsId = $derived(page.params.ws ?? '');

	let exportOpen = $state(false);

	function exportHref(slug?: string, options: Record<string, string> = {}): string {
		const base = resolve('/api/export/[id]', { id: data.doc.id });
		const params = new URLSearchParams();
		if (slug) params.set('template', slug);
		for (const [key, value] of Object.entries(options)) {
			if (value !== '') params.set(`opt.${key}`, value);
		}
		const qs = params.toString();
		return qs ? `${base}?${qs}` : base;
	}
</script>

<svelte:head>
	<title>{data.doc.title || m.doc_untitled()}</title>
</svelte:head>

<article class="doc">
	<header>
		<div class="top">
			<h1>{data.doc.title || m.doc_untitled()}</h1>
			<div class="doc-actions">
				<a href={historyHref(wsId, data.doc.slug)}>{m.doc_history()}</a>
				{#if data.canWrite}
					<a class="edit" href={editHref(wsId, data.doc.slug)}>{m.doc_edit()}</a>
				{/if}
			</div>
		</div>
		<p class="meta">
			<span>{m.doc_updated({ when: formatDate(data.doc.updatedAt, locale) })}</span>
			{#if data.doc.updatedBy}
				<span class="sep">·</span>
				<PersonCard person={data.doc.updatedBy} />
			{/if}
			<span class="sep">·</span>
			<a
				class="pdf"
				href={exportHref(data.defaultTemplate || undefined)}
				target="_blank"
				rel="noopener"
				aria-label={m.doc_export_pdf()}
				title={m.doc_export_pdf()}
				onclick={(e) => {
					if (data.templates.length === 0) return;
					e.preventDefault();
					exportOpen = true;
				}}
			>
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
					<path d="M14 3v5h5" />
					<path d="M8.5 17v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M13 17v-4h1a1.6 1.6 0 0 1 0 4zM17.5 13H16v4M16 15h1.3" />
				</svg>
			</a>
		</p>
		{#if data.doc.tags.length > 0}
			<p class="tags">
				{#each data.doc.tags as tag (tag)}
					<a class="chip" href={workspaceHref(wsId, { tags: [tag] })}>#{tag}</a>
				{/each}
			</p>
		{/if}
	</header>

	{#if data.renderError}
		<p class="render-error">{data.renderError}</p>
	{:else if !data.html.trim()}
		<p class="empty">{m.reader_empty()}</p>
	{:else if data.doc.mode === 'typst'}
		<div class="typst">{@html data.html}</div>
	{:else}
		<div class="prose">{@html data.html}</div>
	{/if}

	{#if data.backlinks.length > 0}
		<footer class="backlinks">
			<h2>{m.doc_backlinks()}</h2>
			<ul>
				{#each data.backlinks as link (link.id)}
					<li><a href={docHref(wsId, link.slug)}>{link.title || m.doc_untitled()}</a></li>
				{/each}
			</ul>
		</footer>
	{/if}
</article>

<ExportDialog
	bind:open={exportOpen}
	templates={data.templates}
	defaultTemplate={data.defaultTemplate}
	frontmatter={data.doc.frontmatter}
	{exportHref}
/>

<style>
	.doc {
		max-width: 46rem;
		margin: 0 auto;
		padding: 48px 32px 96px;
	}

	header {
		margin-bottom: 32px;
	}

	.top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.doc-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		margin-top: 4px;
	}
	.doc-actions a {
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.doc-actions a:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.doc-actions a.edit {
		border: 1px solid var(--border);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 36px;
		font-weight: 600;
		line-height: 1.12;
		letter-spacing: -0.02em;
		font-variation-settings: 'opsz' 72;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin: 10px 0 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}
	.sep {
		opacity: 0.5;
	}
	.pdf {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		color: var(--text-faint);
		transition: background-color 120ms ease, color 120ms ease;
	}
	.pdf:hover {
		background: var(--surface-hover);
		color: var(--brand);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 12px 0 0;
	}
	.chip {
		padding: 1px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		font-size: 11.5px;
		color: var(--text-muted);
	}
	.chip:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.empty,
	.render-error {
		color: var(--text-faint);
		font-size: 13.5px;
	}
	.render-error {
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		white-space: pre-wrap;
	}

	.typst {
		overflow-x: auto;
	}
	.typst :global(svg) {
		max-width: 100%;
		height: auto;
	}

	.backlinks {
		margin-top: 56px;
		padding-top: 20px;
		border-top: 1px solid var(--border);
	}
	.backlinks h2 {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.backlinks ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.backlinks li a {
		display: block;
		padding: 4px 0;
		font-size: 13.5px;
		color: var(--text-muted);
	}
	.backlinks li a:hover {
		color: var(--text);
	}

	.prose {
		font-family: var(--font-read);
		font-size: 17px;
		line-height: 1.7;
		color: var(--text);
	}
	.prose :global(:is(h1, h2, h3, h4)) {
		font-family: var(--font-display);
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.01em;
		margin: 2em 0 0.6em;
	}
	.prose :global(h1) {
		font-size: 1.6em;
	}
	.prose :global(h2) {
		font-size: 1.35em;
	}
	.prose :global(h3) {
		font-size: 1.15em;
	}
	.prose :global(p) {
		margin: 0 0 1.1em;
	}
	.prose :global(a) {
		color: var(--brand);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.prose :global(:is(ul, ol)) {
		margin: 0 0 1.1em;
		padding-inline-start: 1.4em;
	}
	.prose :global(li) {
		margin: 0.3em 0;
	}
	.prose :global(blockquote) {
		margin: 1.4em 0;
		padding-inline-start: 1em;
		border-inline-start: 3px solid var(--brand);
		color: var(--text-muted);
	}
	.prose :global(hr) {
		margin: 2.4em 0;
		border: 0;
		border-top: 1px solid var(--border);
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
		margin: 1.4em 0;
		padding: 14px 16px;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: 13.5px;
		line-height: 1.6;
	}
	.prose :global(pre code) {
		padding: 0;
		border: 0;
		background: none;
		font-size: inherit;
	}
	.prose :global(img),
	.prose :global(svg) {
		max-width: 100%;
		height: auto;
	}
	.prose :global(.typst-figure) {
		margin: 1.6em 0;
		overflow-x: auto;
	}
	.prose :global(.typst-figure img) {
		display: block;
		margin: 0 auto;
	}
	.prose :global(table) {
		width: 100%;
		margin: 1.4em 0;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 14px;
	}
	.prose :global(:is(th, td)) {
		padding: 7px 10px;
		border: 1px solid var(--border);
		text-align: start;
	}
	.prose :global(th) {
		background: var(--surface);
		font-weight: 600;
	}

	@media (max-width: 720px) {
		.doc {
			padding: 28px 18px 64px;
		}
		h1 {
			font-size: 28px;
		}
	}
</style>
