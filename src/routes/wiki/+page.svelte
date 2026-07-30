<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let filter = $state('');

	const q = $derived(filter.trim().toLowerCase());

	function matches(d: { title: string; tags: string[] }): boolean {
		if (!q) return true;
		return d.title.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q));
	}

	const sections = $derived(
		data.sections
			.map((s) => ({ ...s, docs: s.docs.filter(matches) }))
			.filter((s) => s.docs.length > 0)
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
		{#if data.tags.length > 0}
			<nav class="tags" aria-label="tags">
				{#each data.tags as t (t.name)}
					<a
						class="tag"
						class:on={data.tag === t.name}
						href={data.tag === t.name ? '/wiki' : `/wiki?tag=${encodeURIComponent(t.name)}`}
					>
						{t.name} <span class="count">{t.count}</span>
					</a>
				{/each}
			</nav>
		{/if}
	</header>

	{#if sections.length === 0}
		<p class="empty">{m.wiki_empty()}</p>
	{:else}
		{#if !q && data.featured.some((d) => d.views > 0)}
			<section class="featured">
				<h2>{m.wiki_most_viewed()}</h2>
				<div class="cards">
					{#each data.featured as d (d.publicSlug)}
						<a class="card" href={`/wiki/${encodeURIComponent(d.publicSlug)}`}>
							<span class="card-ws">{d.workspaceName}</span>
							<span class="card-title">{d.title}</span>
							<span class="card-meta">{d.views} {m.wiki_views()}</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#each sections as s (s.id)}
			<section class="ws-section">
				<h2>{s.name} <span class="ws-count">{s.docs.length}</span></h2>
				<ul class="articles">
					{#each s.docs as d (d.publicSlug)}
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
			</section>
		{/each}
	{/if}
</div>

<style>
	.page {
		max-width: 920px;
		margin: 0 auto;
		padding: 40px 24px 96px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 32px;
		font-weight: 600;
	}
	.sub {
		margin: 6px 0 16px;
		font-size: 14px;
		color: var(--text-muted);
	}

	.filter {
		width: 100%;
		height: 38px;
		padding: 0 13px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		font-family: inherit;
		font-size: 14px;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 12px 0 0;
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
		margin-top: 28px;
		font-size: 13px;
		color: var(--text-faint);
		font-style: italic;
	}

	h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 600;
	}
	.ws-count {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-faint);
	}

	.featured {
		margin-top: 32px;
	}
	.featured h2 {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 10px;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		text-decoration: none;
		color: var(--text);
		transition: border-color 120ms ease, background-color 120ms ease;
	}
	.card:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.card-ws {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--brand);
	}
	.card-title {
		font-size: 14px;
		font-weight: 500;
		line-height: 1.35;
	}
	.card-meta {
		margin-top: auto;
		font-size: 11.5px;
		color: var(--text-faint);
	}

	.ws-section {
		margin-top: 36px;
	}

	.articles {
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--border);
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
