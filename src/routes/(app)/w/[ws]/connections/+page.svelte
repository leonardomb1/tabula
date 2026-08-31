<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import LocalGraph from '$lib/components/LocalGraph.svelte';
	import { docHref } from '$lib/nav';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const wsId = $derived(page.params.ws ?? '');

	function select(node: { slug: string }) {
		goto(`?doc=${encodeURIComponent(node.slug)}`, { noScroll: true, keepFocus: true });
	}
</script>

<svelte:head>
	<title>{m.nav_connections()}</title>
</svelte:head>

<div class="page">
	<header>
		<h1>{m.nav_connections()}</h1>
		<p class="sub">
			{m.connections_summary({
				docs: data.graph.nodes.length,
				links: data.graph.edges.length
			})}
		</p>
	</header>

	{#key wsId}
		<LocalGraph
			nodes={data.graph.nodes}
			edges={data.graph.edges}
			selected={data.selected?.id ?? null}
			onselect={select}
			width={960}
			height={520}
		/>
	{/key}

	{#if data.selected}
		<section class="details">
			<h2 class="det-title">
				<a href={docHref(wsId, data.selected.slug)}>{data.selected.title || m.doc_untitled()}</a>
				{#each data.selected.tags as tag (tag)}<span class="chip">#{tag}</span>{/each}
			</h2>

			<div class="cols">
				{#if data.selected.backlinks.length}
					<section>
						<h3>{m.doc_backlinks()}</h3>
						<ul>
							{#each data.selected.backlinks as link (link.id)}
								<li>
									<a href={docHref(wsId, link.slug)}>{link.title || m.doc_untitled()}</a>
									{#if link.excerpt}<p class="snippet">{link.excerpt}</p>{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if data.selected.related.length}
					<section>
						<h3>{m.doc_related()}</h3>
						<ul>
							{#each data.selected.related as link (link.id)}
								<li><a href={docHref(wsId, link.slug)}>{link.title || m.doc_untitled()}</a></li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if data.selected.mentions.length}
					<section>
						<h3>{m.doc_mentions_unlinked()}</h3>
						<ul>
							{#each data.selected.mentions as link (link.id)}
								<li>
									<a href={docHref(wsId, link.slug)}>{link.title || m.doc_untitled()}</a>
									{#if link.excerpt}<p class="snippet">{link.excerpt}</p>{/if}
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</div>

			{#if !data.selected.backlinks.length && !data.selected.related.length && !data.selected.mentions.length}
				<p class="hint">{m.connections_none()}</p>
			{/if}
		</section>
	{:else}
		<p class="hint">{m.connections_hint()}</p>
	{/if}
</div>

<style>
	.page {
		max-width: 62rem;
		margin: 0 auto;
		padding: 40px 32px 80px;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 18px;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.015em;
	}

	.sub {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.hint {
		margin: 16px 2px;
		font-size: 13px;
		color: var(--text-faint);
	}

	.details {
		margin-top: 22px;
	}

	.det-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 14px;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 600;
	}
	.det-title a:hover {
		color: var(--brand);
	}

	.chip {
		font-size: 10.5px;
		font-weight: 400;
		font-family: var(--font-ui);
		color: var(--text-faint);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 8px;
	}

	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 22px 32px;
	}

	h3 {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		padding: 5px 0;
	}
	li a {
		display: block;
		font-size: 13.5px;
		color: var(--text-muted);
	}
	li a:hover {
		color: var(--text);
	}

	.snippet {
		margin: 2px 0 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-faint);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	@media (max-width: 720px) {
		.page {
			padding: 24px 16px 56px;
		}
	}
</style>
