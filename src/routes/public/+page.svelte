<script lang="ts">
	import type { PageData } from './$types';
	import BrandLogo from "$lib/BrandLogo.svelte";
	import UserMenu from '$lib/UserMenu.svelte';
	import { page } from '$app/stores';
	let { data }: { data: PageData } = $props();

	const initTag = $page.url.searchParams.get('tag');
	let selectedTags = $state<Set<string>>(initTag ? new Set([initTag]) : new Set());

	const filtered = $derived(
		selectedTags.size > 0
			? data.docs.filter((d) => [...selectedTags].every((t) => d.tags.includes(t)))
			: data.docs
	);

	function toggleTag(tag: string) {
		const next = new Set(selectedTags);
		next.has(tag) ? next.delete(tag) : next.add(tag);
		selectedTags = next;
	}

	function formatDate(d: Date) {
		return new Date(d).toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>{data.branding.name} · Público</title>
</svelte:head>

<div class="index-page">
	<header class="site-header">
		<div class="header-inner">
			<BrandLogo />
			<h1 class="site-title">{data.branding.name} · Público</h1>
			<div class="spacer"></div>
			<UserMenu />
		</div>
	</header>

	<main class="index-main">
		{#if data.docs.length === 0}
			<div class="empty-state">
				<p>Nenhum documento público disponível.</p>
			</div>
		{:else}
			<div class="index-layout">
				{#if data.allTags.length > 0}
					<aside class="tag-sidebar">
						<p class="sidebar-heading">Tags</p>
						<ul class="tag-list">
							{#each data.allTags as tag}
								<li>
									<button
										class="tag-btn"
										class:active={selectedTags.has(tag)}
										onclick={() => toggleTag(tag)}
									>
										{tag}
										<span class="tag-count">{data.docs.filter(d => d.tags.includes(tag)).length}</span>
									</button>
								</li>
							{/each}
						</ul>
						{#if selectedTags.size > 0}
							<button class="clear-btn" onclick={() => selectedTags = new Set()}>✕ Limpar filtros</button>
						{/if}
					</aside>
				{/if}

				<div class="doc-section">
					{#if filtered.length === 0}
						<p class="no-results">Nenhum documento com as tags <strong>{[...selectedTags].join(', ')}</strong>.</p>
					{:else}
						<ul class="doc-list">
							{#each filtered as doc}
								<li class="doc-item">
									<a href="/public/{doc.slug}" class="doc-link">
										<div class="doc-main">
											<span class="doc-title">{doc.title}</span>
											{#if doc.tags.length > 0}
												<div class="doc-tags">
													{#each doc.tags as tag}
														<button
															class="inline-tag"
															class:active={selectedTags.has(tag)}
															onclick={(e) => { e.preventDefault(); toggleTag(tag); }}
														>{tag}</button>
													{/each}
												</div>
											{/if}
										</div>
										<span class="doc-meta">{doc.slug} &middot; {formatDate(doc.mtime)}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.index-page {
		min-height: 100vh;
		background: #fafaf8;
		font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
	}

	.site-header {
		border-bottom: 1px solid #e0ddd5;
		background: #fff;
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.spacer { flex: 1; }

	.header-inner {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1.1rem 2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.site-title {
		font-size: 1.4rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: #1a1a1a;
		margin: 0;
		flex-shrink: 0;
	}

	/* ── Main layout ── */
	.index-main {
		max-width: 960px;
		margin: 0 auto;
		padding: 2.5rem 2rem 4rem;
	}

	.index-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2rem;
	}

	@media (min-width: 720px) {
		.index-layout:has(.tag-sidebar) {
			grid-template-columns: 160px minmax(0, 1fr);
			gap: 3rem;
		}
	}

	/* ── Tag sidebar ── */
	.tag-sidebar {
		position: sticky;
		top: 2rem;
		align-self: start;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}

	.sidebar-heading {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #aaa;
		margin: 0 0 0.65rem;
	}

	.tag-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.tag-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		background: none;
		border: none;
		padding: 0.3rem 0.5rem;
		border-radius: 5px;
		font-size: 0.82rem;
		color: #555;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s, color 0.1s;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}

	.tag-btn:hover { background: #f0ede6; color: #1a1a1a; }

	.tag-btn.active {
		background: #1a1a1a;
		color: #fff;
	}

	.tag-count {
		font-size: 0.72rem;
		color: #bbb;
		font-family: ui-monospace, monospace;
	}

	.tag-btn.active .tag-count { color: #aaa; }

	.clear-btn {
		margin-top: 0.75rem;
		background: none;
		border: none;
		font-size: 0.75rem;
		color: #aaa;
		cursor: pointer;
		padding: 0.2rem 0.5rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		transition: color 0.1s;
	}

	.clear-btn:hover { color: var(--brand); }

	/* ── Doc list ── */
	.empty-state {
		text-align: center;
		padding: 4rem 0;
		color: #888;
	}

	.no-results {
		color: #aaa;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.9rem;
		padding: 2rem 0;
	}

	.doc-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.doc-item {
		border-bottom: 1px solid #e8e5df;
	}

	.doc-item:first-child {
		border-top: 1px solid #e8e5df;
	}

	.doc-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 0;
		text-decoration: none;
		color: inherit;
	}

	.doc-link:hover .doc-title { color: var(--brand); }

	.doc-main {
		display: flex;
		align-items: baseline;
		gap: 0.65rem;
		flex-wrap: wrap;
		min-width: 0;
	}

	.doc-title {
		font-size: 1.1rem;
		color: #1a1a1a;
		font-weight: 500;
		transition: color 0.1s;
		flex-shrink: 0;
	}

	.doc-tags {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.inline-tag {
		background: #f0ede6;
		border: none;
		color: #666;
		padding: 0.1em 0.55em;
		border-radius: 999px;
		font-size: 0.72rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
		line-height: 1.6;
	}

	.inline-tag:hover { background: #e2ddd4; color: #1a1a1a; }

	.inline-tag.active {
		background: #1a1a1a;
		color: #fff;
	}

	.doc-meta {
		font-size: 0.78rem;
		color: #aaa;
		white-space: nowrap;
		font-family: ui-monospace, monospace;
		flex-shrink: 0;
	}

	@media (max-width: 640px) {
		.header-inner {
			padding: 0.75rem 0.9rem;
			gap: 0.5rem;
		}
		.site-title { font-size: 1rem; }

		.index-main { padding: 1.5rem 1rem 6rem; }

		.tag-sidebar { position: static; }
		.tag-list { flex-direction: row; flex-wrap: wrap; gap: 0.3rem; }
		.tag-btn { width: auto; padding: 0.3rem 0.65rem; }

		.doc-link {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
			padding: 0.75rem 0;
		}
		.doc-title { font-size: 1rem; }
		.doc-meta { font-size: 0.72rem; }
	}
</style>
