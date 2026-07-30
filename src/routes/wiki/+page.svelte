<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let filter = $state('');

	const shown = $derived(
		filter.trim()
			? data.docs.filter(
					(d) =>
						d.title.toLowerCase().includes(filter.trim().toLowerCase()) ||
						d.tags.some((t) => t.toLowerCase().includes(filter.trim().toLowerCase()))
				)
			: data.docs
	);

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>{m.wiki_title()}</title>
</svelte:head>

<div class="page">
	<header>
		<h1>{m.wiki_title()}</h1>
		<p class="sub">{m.wiki_subtitle()}</p>
		<input class="filter" placeholder={m.wiki_filter()} bind:value={filter} autocomplete="off" />
	</header>

	{#if data.tags.length > 0}
		<nav class="tags" aria-label="tags">
			{#each data.tags as t (t.name)}
				<a class="tag" class:on={data.tag === t.name} href={data.tag === t.name ? '/wiki' : `/wiki?tag=${encodeURIComponent(t.name)}`}>
					{t.name} <span class="count">{t.count}</span>
				</a>
			{/each}
		</nav>
	{/if}

	{#if shown.length === 0}
		<p class="empty">{m.wiki_empty()}</p>
	{:else}
		<ul class="articles">
			{#each shown as d (d.publicSlug)}
				<li>
					<a class="article" href={`/wiki/${encodeURIComponent(d.publicSlug)}`}>
						<span class="title">{d.title}</span>
						<span class="meta">
							{#each d.tags.slice(0, 3) as t (t)}<span class="chip">{t}</span>{/each}
							<span class="dim">{when(d.updatedAt)} · {d.views} {m.wiki_views()}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.page {
		max-width: 860px;
		margin: 0 auto;
		padding: 32px 24px 96px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
	}
	.sub {
		margin: 4px 0 14px;
		font-size: 13px;
		color: var(--text-muted);
	}

	.filter {
		width: 100%;
		height: 34px;
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font-family: inherit;
		font-size: 13.5px;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 14px 0 6px;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 9px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 12px;
		color: var(--text-muted);
		text-decoration: none;
	}
	.tag:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.tag.on {
		color: var(--brand);
		border-color: var(--brand);
	}
	.count {
		font-size: 10.5px;
		color: var(--text-faint);
	}

	.empty {
		margin-top: 24px;
		font-size: 13px;
		color: var(--text-faint);
		font-style: italic;
	}

	.articles {
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
	}
	.article {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 10px 8px;
		border-bottom: 1px solid var(--border);
		text-decoration: none;
		color: var(--text);
	}
	.article:hover {
		background: var(--surface-hover);
	}
	.title {
		font-size: 15px;
		font-weight: 500;
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.chip {
		padding: 1px 7px;
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.dim {
		margin-inline-start: auto;
	}
</style>
