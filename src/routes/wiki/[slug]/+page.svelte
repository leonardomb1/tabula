<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>{data.article.title} — {m.wiki_title()}</title>
</svelte:head>

<article class="doc">
	<header>
		<h1>{data.article.title}</h1>
		<div class="meta">
			{#each data.article.tags as t (t)}<span class="chip">{t}</span>{/each}
			<span class="dim">{when(data.article.updatedAt)} · {data.views} {m.wiki_views()}</span>
			{#if data.article.canOpenInApp}
				<a class="app-link" href={data.article.appHref}>{m.wiki_open_in_app()}</a>
			{/if}
		</div>
	</header>

	{#if data.renderError}
		<p class="render-error">{data.renderError}</p>
	{:else if data.article.mode === 'typst'}
		<div class="typst-body">{@html data.html}</div>
	{:else}
		<div class="prose">{@html data.html}</div>
	{/if}

	<footer>
		<a class="request" href={`/wiki/${encodeURIComponent(page.params.slug ?? '')}/pdf`} target="_blank" rel="noopener">
			{m.doc_export_pdf()}
		</a>
		{#if data.updateRequested || form?.requested}
			<span class="requested">{m.wiki_request_update_done()}</span>
		{:else if data.canRequestUpdate}
			<form method="POST" action="?/requestUpdate" use:enhance>
				<button type="submit" class="request">{m.wiki_request_update()}</button>
			</form>
		{/if}
	</footer>
</article>

<style>
	.doc {
		max-width: 780px;
		margin: 0 auto;
		padding: 36px 24px 96px;
	}

	h1 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-size: 30px;
		font-weight: 600;
		line-height: 1.2;
		text-wrap: balance;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding-bottom: 18px;
		margin-bottom: 22px;
		border-bottom: 1px solid var(--border);
		font-size: 12px;
		color: var(--text-faint);
	}
	.chip {
		padding: 1px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.dim {
		margin-inline-start: 4px;
	}
	.app-link {
		margin-inline-start: auto;
		color: var(--text-muted);
		text-decoration: none;
	}
	.app-link:hover {
		color: var(--text);
	}

	.render-error {
		padding: 10px 12px;
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 13px;
		white-space: pre-wrap;
	}

	footer {
		margin-top: 48px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}
	.request {
		height: 28px;
		padding: 0 12px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-muted);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.request:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.requested {
		font-size: 12px;
		color: var(--text-faint);
		font-style: italic;
	}
</style>
