<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import DocBody from '$lib/components/DocBody.svelte';
	import { countView } from '$lib/view-count';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Counted here rather than in load: hover-preloading runs loads for pages
	// nobody opens. Shown count excludes this read until the server flushes.
	$effect(() => {
		countView(data.article.id, 'wiki');
	});

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
		<DocBody html={data.html} mode="typst" />
	{:else}
		<DocBody html={data.html} />
	{/if}
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

</style>
