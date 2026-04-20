<script lang="ts">
	import type { PageData } from './$types';
	import TopBar from '$lib/TopBar.svelte';
	import { toggleAi, aiDock } from '$lib/aiDock.svelte';
	import { page } from '$app/stores';
	import { ROLES, isAtLeast } from '$lib/roles';
	import { docPath } from '$lib/ids';
	import MobileSheet from '$lib/MobileSheet.svelte';

	let { data }: { data: PageData } = $props();

	// `currentRole` is merged in from +layout.server.ts — viewers hide
	// write affordances (+ Novo, empty-state CTA).
	const canWrite = $derived(isAtLeast(data.currentRole, ROLES.EDITOR));

	const initTag = $page.url.searchParams.get('tag');
	let selectedTags = $state<Set<string>>(initTag ? new Set([initTag]) : new Set());
	let sortMode = $state<'recent' | 'alpha'>('recent');

	const filtered = $derived(
		selectedTags.size > 0
			? data.docs.filter((d) => [...selectedTags].every((t) => d.tags.includes(t)))
			: data.docs
	);

	const sorted = $derived.by(() => {
		if (sortMode === 'alpha') {
			return [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
		}
		// 'recent' — server already returned docs sorted by date desc.
		return filtered;
	});

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
	<title>{data.branding.name}</title>
</svelte:head>

<div class="atelier">
	<TopBar ws={data.currentWs}>
		{#snippet actions()}
			<button
				type="button"
				class="icon-btn"
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
			{#if canWrite}
				<a href="/new?ws={data.currentWs.id}" class="action-btn primary">+ Novo</a>
			{/if}
		{/snippet}
	</TopBar>

	<MobileSheet label="Menu">
		{#if canWrite}
			<a href="/new?ws={data.currentWs.id}" class="sheet-action">
				<span class="sheet-action__icon" aria-hidden="true">
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
				</span>
				<span class="sheet-action__meta">
					<span class="sheet-action__label">Novo documento</span>
					<span class="sheet-action__hint">em {data.currentWs.name}</span>
				</span>
			</a>
		{/if}
		<button type="button" class="sheet-action" onclick={toggleAi}>
			<span class="sheet-action__icon" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5.5 13v-1.5H3A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.2 7.2h.01M8 7.2h.01M10.8 7.2h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
			</span>
			<span class="sheet-action__meta">
				<span class="sheet-action__label">Assistente IA</span>
				<span class="sheet-action__hint">Perguntar sobre o workspace</span>
			</span>
		</button>
	</MobileSheet>

	<main class="index-main">
		{#if data.docs.length === 0}
			<div class="empty-state">
				<h1 class="empty-title">{data.currentWs.name}</h1>
				<p class="empty-text">Nenhum documento ainda.</p>
				{#if canWrite}
					<a href="/new?ws={data.currentWs.id}" class="empty-cta">Criar o primeiro documento →</a>
				{:else}
					<p class="empty-text" style="font-style: italic;">Você tem acesso somente-leitura a este workspace.</p>
				{/if}
			</div>
		{:else}
			<section class="index-header">
				<p class="eyebrow">Workspace</p>
				<h1 class="index-title">{data.currentWs.name}</h1>
				<p class="index-count">
					<strong>{data.docs.length}</strong>
					{data.docs.length === 1 ? 'documento' : 'documentos'}
					{#if selectedTags.size > 0}
						— filtrando por
						<em>{[...selectedTags].join(', ')}</em>
					{/if}
				</p>
			</section>

			<div class="index-layout" class:has-tags={data.allTags.length > 0}>
				{#if data.allTags.length > 0}
					<aside class="tag-rail">
						<p class="rail-head">Tags</p>
						<ul class="tag-list">
							{#each data.allTags as tag}
								<li>
									<button
										class="tag-btn"
										class:is-active={selectedTags.has(tag)}
										onclick={() => toggleTag(tag)}
									>
										<span class="tag-name">{tag}</span>
										<span class="tag-count">
											{data.docs.filter((d) => d.tags.includes(tag)).length}
										</span>
									</button>
								</li>
							{/each}
						</ul>
						{#if selectedTags.size > 0}
							<button class="clear-btn" onclick={() => (selectedTags = new Set())}>
								Limpar filtros
							</button>
						{/if}
					</aside>
				{/if}

				<div class="doc-section">
					<div class="doc-section-head">
						<h2 class="doc-section-title">Todos os documentos</h2>
						<span class="spacer"></span>
						<div class="sort-seg" role="tablist" aria-label="Ordenar">
							<button
								type="button"
								role="tab"
								aria-selected={sortMode === 'recent'}
								class:is-active={sortMode === 'recent'}
								onclick={() => (sortMode = 'recent')}
							>Recentes</button>
							<button
								type="button"
								role="tab"
								aria-selected={sortMode === 'alpha'}
								class:is-active={sortMode === 'alpha'}
								onclick={() => (sortMode = 'alpha')}
							>A – Z</button>
						</div>
					</div>

					{#if sorted.length === 0}
						<p class="no-results">
							Nenhum documento com
							{selectedTags.size === 1 ? 'a tag' : 'as tags'}
							<strong>{[...selectedTags].join(', ')}</strong>.
						</p>
					{:else}
						<ul class="doc-list">
							{#each sorted as doc}
								<li class="doc-item">
									<a href={docPath(data.currentWs.id, doc.slug, doc.title)} class="doc-link">
										<h3 class="doc-title">{doc.title}</h3>
										{#if doc.description}
											<p class="doc-excerpt">{doc.description}</p>
										{/if}
										<p class="doc-meta">
											<span class="doc-slug">{doc.slug}</span>
											<span class="sep">·</span>
											<time>{formatDate(doc.date ?? doc.mtime)}</time>
										</p>
										{#if doc.tags.length > 0}
											<div class="doc-tags">
												{#each doc.tags as tag}
													<button
														class="doc-tag"
														class:is-active={selectedTags.has(tag)}
														onclick={(e) => { e.preventDefault(); toggleTag(tag); }}
													>{tag}</button>
												{/each}
											</div>
										{/if}
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
	.atelier {
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
	}

	/* Top bar, brand slot, workspace pill, and search positioning all live
	   in $lib/TopBar.svelte. Button classes below decorate the cluster
	   this page passes into TopBar's `actions` snippet. */
	.icon-btn {
		display: inline-grid;
		place-items: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.icon-btn:hover {
		background: var(--surface);
		border-color: var(--rule);
		color: var(--ink);
	}

	.icon-btn.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
		border-color: transparent;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 14px;
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

	/* ══════════════════════════════════════
	   Index header
	═══════════════════════════════════════ */
	.index-main {
		max-width: 1080px;
		margin: 0 auto;
		padding: 24px 28px 96px;
	}

	.index-header {
		margin-bottom: 28px;
		max-width: 780px;
	}

	.eyebrow {
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 0 0 12px;
	}

	.index-title {
		font-family: var(--font-serif-display);
		font-size: 48px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.05;
		font-variation-settings: 'opsz' 96;
		margin: 0 0 12px;
		color: var(--ink);
	}

	.index-count {
		font-family: var(--font-serif-body);
		font-size: 16px;
		color: var(--ink-soft);
		font-style: italic;
		margin: 0;
	}

	.index-count strong { font-weight: 600; color: var(--ink); font-style: normal; }
	.index-count em { color: var(--accent-ink); font-style: normal; font-weight: 500; }

	/* ══════════════════════════════════════
	   Layout — tag rail + doc list
	═══════════════════════════════════════ */
	.index-layout {
		display: grid;
		grid-template-columns: 1fr;
		gap: 32px;
	}

	.index-layout.has-tags {
		grid-template-columns: 200px 1fr;
		gap: 64px;
	}

	@media (max-width: 720px) {
		/* Mobile collapses the sidebar into a horizontal scrolling chip
		   row above the doc list — a classic app-style tag filter. The
		   sticky sidebar was creating layering issues with the doc cards
		   below; the horizontal row is flat and scrolls with the page. */
		.index-layout.has-tags {
			grid-template-columns: 1fr;
			gap: 20px;
		}
	}

	/* ── Tag rail ── */
	.tag-rail {
		position: sticky;
		top: 72px;
		align-self: start;
	}

	@media (max-width: 720px) {
		.tag-rail {
			position: static;
			display: flex;
			align-items: center;
			gap: 10px;
			overflow-x: auto;
			padding-bottom: 6px;
			margin: 0 -20px;
			padding-left: 20px;
			padding-right: 20px;
			scrollbar-width: none;
		}
		.tag-rail::-webkit-scrollbar { display: none; }
		.tag-rail .rail-head {
			padding-left: 0;
			margin: 0;
			flex-shrink: 0;
		}
		.tag-rail .tag-list {
			flex-direction: row;
			flex-wrap: nowrap;
			gap: 6px;
		}
		.tag-rail .tag-btn {
			width: auto;
			padding: 5px 12px;
			border: 1px solid var(--rule);
			border-radius: 999px;
			white-space: nowrap;
			flex-shrink: 0;
		}
		.tag-rail .clear-btn {
			margin: 0;
			flex-shrink: 0;
		}
	}

	.rail-head {
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 0 0 6px;
		padding-left: 10px;
		display: flex;
		align-items: center;
		min-height: 28px;
	}

	.tag-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.tag-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 5px 10px;
		border: 0;
		background: transparent;
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 13px;
		color: var(--ink-soft);
		text-align: left;
	}

	.tag-btn:hover { background: var(--bg-deep); color: var(--ink); }

	.tag-btn.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 500;
	}

	.tag-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.tag-count {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-muted);
	}

	.tag-btn.is-active .tag-count { color: var(--accent-ink); }

	.clear-btn {
		margin: 10px 10px 0;
		padding: 6px 10px;
		background: transparent;
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-size: 12px;
		color: var(--ink-soft);
		font-family: var(--font-sans);
	}

	.clear-btn:hover { background: var(--surface); color: var(--ink); }

	/* ══════════════════════════════════════
	   Doc section — head with sort seg
	═══════════════════════════════════════ */
	.doc-section { min-width: 0; }

	.doc-section-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 6px;
	}

	.doc-section-title {
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 0;
	}

	.doc-section-head .spacer { flex: 1; }

	.sort-seg {
		display: inline-flex;
		gap: 2px;
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		border-radius: 5px;
		padding: 2px;
	}

	.sort-seg button {
		height: 24px;
		padding: 0 10px;
		border: 0;
		background: transparent;
		color: var(--ink-muted);
		border-radius: 3px;
		font-size: 11.5px;
		font-family: var(--font-sans);
		cursor: pointer;
	}

	.sort-seg button:hover { color: var(--ink); }

	.sort-seg button.is-active {
		background: var(--surface);
		color: var(--ink);
		font-weight: 500;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
	}

	/* ══════════════════════════════════════
	   Doc list
	═══════════════════════════════════════ */
	.doc-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.doc-item {
		border-bottom: 1px solid var(--rule-soft);
		padding: 22px 0 20px;
	}

	.doc-item:first-child {
		border-top: 1px solid var(--rule-soft);
	}

	.doc-item:last-child { border-bottom: 0; }

	.doc-link {
		display: block;
		color: inherit;
		transition: padding 0.15s;
	}

	.doc-link:hover { padding-left: 8px; }
	.doc-link:hover .doc-title { color: var(--accent-ink); }

	.doc-title {
		font-family: var(--font-serif-display);
		font-size: 22px;
		font-weight: 500;
		letter-spacing: -0.01em;
		line-height: 1.25;
		margin: 0 0 6px;
		color: var(--ink);
		font-variation-settings: 'opsz' 36;
		transition: color 0.15s;
	}

	.doc-excerpt {
		font-family: var(--font-serif-body);
		font-size: 14.5px;
		line-height: 1.55;
		color: var(--ink-soft);
		margin: 0 0 8px;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-wrap: pretty;
	}

	.doc-meta {
		font-family: var(--font-sans);
		font-size: 12px;
		color: var(--ink-muted);
		margin: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.doc-meta .doc-slug { font-family: var(--font-mono); }
	.doc-meta .sep { color: var(--ink-muted); opacity: 0.5; }

	.doc-tags {
		margin-top: 10px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.doc-tag {
		background: var(--chip-bg);
		border: 0;
		padding: 2px 8px;
		border-radius: 999px;
		font-family: var(--font-sans);
		font-size: 11px;
		color: var(--ink-soft);
		cursor: pointer;
	}

	.doc-tag:hover { background: var(--accent-soft); color: var(--accent-ink); }
	.doc-tag.is-active { background: var(--accent-soft); color: var(--accent-ink); font-weight: 500; }

	.no-results {
		font-family: var(--font-serif-body);
		font-style: italic;
		color: var(--ink-soft);
		padding: 40px 0;
	}

	/* ══════════════════════════════════════
	   Empty state
	═══════════════════════════════════════ */
	.empty-state {
		max-width: 560px;
		margin: 96px auto;
		text-align: center;
	}

	.empty-title {
		font-family: var(--font-serif-display);
		font-size: 48px;
		font-weight: 500;
		letter-spacing: -0.02em;
		margin: 0 0 16px;
		color: var(--ink);
	}

	.empty-text {
		font-family: var(--font-serif-body);
		font-size: 18px;
		font-style: italic;
		color: var(--ink-soft);
		margin: 0 0 24px;
	}

	.empty-cta {
		display: inline-flex;
		padding: 10px 20px;
		background: var(--ink);
		color: var(--bg);
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 14px;
	}

	.empty-cta:hover { background: oklch(0.3 0.015 80); }

	/* ══════════════════════════════════════
	   Responsive
	═══════════════════════════════════════ */
	@media (max-width: 860px) {
		.index-main { padding: 32px 20px 64px; }
		.index-title { font-size: 36px; }
	}

</style>
