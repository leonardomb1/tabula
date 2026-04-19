<script lang="ts">
	import type { PageData } from './$types';
	import Search from '$lib/Search.svelte';
	import BrandLogo from '$lib/BrandLogo.svelte';
	import UserMenu from '$lib/UserMenu.svelte';
	import PdfPreviewModal from '$lib/PdfPreviewModal.svelte';
	import { aiDock, toggleAi } from '$lib/aiDock.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { cubicOut } from 'svelte/easing';

	let { data }: { data: PageData } = $props();

	let previewOpen = $state(false);
	let copied = $state(false);
	let menuOpen = $state(false);
	let menuWrapEl = $state<HTMLDivElement | null>(null);
	let activeTocId = $state<string | null>(null);
	let activeCiteKey = $state<string | null>(null);
	let margListEl = $state<HTMLElement | null>(null);
	let tocRailEl = $state<HTMLElement | null>(null);
	let showBackToTop = $state(false);

	// Drive layout grid: when the left rail has nothing to show we drop
	// the aside and collapse the first column so the article doesn't get
	// squeezed into the old 260px slot.
	const hasLeftRail = $derived(data.citedRefs.length > 0 || data.backlinks.length > 0);

	// Shared drop-in animation: fade + slide-down + scale-from-0.96, anchored
	// top-right so it feels like it pops out of the trigger. Same shape as
	// UserMenu's dropdown — kept inline here to avoid a one-export lib file.
	function popIn(_node: Element, { duration = 160 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) =>
				`opacity: ${t};` +
				`transform: translateY(${(1 - t) * -6}px) scale(${0.96 + t * 0.04});` +
				`transform-origin: top right;`
		};
	}

	// Close the kebab menu on outside click / Escape — without these, opening
	// it and navigating away clicks-through to the page behind.
	function onDocClick(e: MouseEvent) {
		if (!menuOpen) return;
		if (menuWrapEl && !menuWrapEl.contains(e.target as Node)) menuOpen = false;
	}

	function onDocKey(e: KeyboardEvent) {
		if (menuOpen && e.key === 'Escape') menuOpen = false;
	}

	// Mermaid re-render whenever the HTML changes. Initialize once, cheap to
	// call run() when no .mermaid nodes exist.
	$effect(() => {
		data.html;
		import('mermaid').then(({ default: mermaid }) => {
			mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
			// Narrow containers make mermaid throw "Could not find a suitable
			// point" and similar layout errors. Swallow — the worst case is
			// the raw fenced code stays on screen instead of the diagram.
			mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
		});
	});

	// Scroll-spy for the right-rail TOC. IntersectionObserver flags the
	// closest visible heading; the TOC list highlights the matching entry.
	$effect(() => {
		data.html;
		const headings = Array.from(
			document.querySelectorAll('.doc-body :is(h1, h2, h3, h4)[id]')
		) as HTMLElement[];
		if (headings.length === 0) return;

		// Sorted list of heading positions tracked as they scroll past the
		// reading zone (roughly 30% viewport height down). Using scroll events
		// instead of IO here so we always pick the *last* heading above the
		// threshold — IO alone can leave the first visible entry selected
		// even after it's scrolled off the top.
		const onScroll = () => {
			const threshold = window.innerHeight * 0.3;
			let current: string | null = null;
			for (const h of headings) {
				if (h.getBoundingClientRect().top < threshold) current = h.id;
				else break;
			}
			if (current !== activeTocId) activeTocId = current;
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	// Scroll-spy for the left-rail "Na margem" citation cards. Mirrors the
	// TOC pattern: the last inline cite that scrolled past the reading-zone
	// threshold becomes the active one; its card highlights and, when the
	// rail is too short to fit all cards in view, scrolls the card into
	// view within the rail container.
	$effect(() => {
		data.html;
		if (data.citedRefs.length === 0) return;

		const cites = Array.from(
			document.querySelectorAll<HTMLElement>('.doc-body .cite-link[href^="#ref-"]')
		);
		if (cites.length === 0) return;

		const onScroll = () => {
			const threshold = window.innerHeight * 0.35;
			let current: string | null = null;
			for (const a of cites) {
				if (a.getBoundingClientRect().top < threshold) {
					const href = a.getAttribute('href') ?? '';
					current = href.replace(/^#ref-/, '') || null;
				} else break;
			}
			if (current !== activeCiteKey) activeCiteKey = current;
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	// Keep the active marginalia card in view inside the rail. We scroll
	// the rail container (not the page) so the body position doesn't jump
	// when the active cite changes.
	$effect(() => {
		activeCiteKey;
		if (!activeCiteKey || !margListEl) return;
		const card = margListEl.querySelector<HTMLElement>(
			`[data-cite-key="${CSS.escape(activeCiteKey)}"]`
		);
		if (!card) return;
		const rail = margListEl;
		const railBox = rail.getBoundingClientRect();
		const cardBox = card.getBoundingClientRect();
		if (cardBox.top < railBox.top || cardBox.bottom > railBox.bottom) {
			card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	// Mirror the same pattern for the right-rail TOC — on long docs the
	// rail overflows and the active entry disappears above the fold as
	// the reader scrolls. Keep it in view within the rail's own scroller.
	$effect(() => {
		activeTocId;
		if (!activeTocId || !tocRailEl) return;
		const item = tocRailEl.querySelector<HTMLElement>('li.is-active');
		if (!item) return;
		const railBox = tocRailEl.getBoundingClientRect();
		const itemBox = item.getBoundingClientRect();
		if (itemBox.top < railBox.top || itemBox.bottom > railBox.bottom) {
			item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	// Show a floating "back to top" button once the reader has scrolled
	// past roughly one viewport height. 80% keeps it from flashing on
	// short docs while staying close enough for long ones to catch it
	// near the end of the first screen.
	$effect(() => {
		const onScroll = () => {
			const next = window.scrollY > window.innerHeight * 0.8;
			if (next !== showBackToTop) showBackToTop = next;
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});

	function scrollToTop() {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	/** Hovering or focusing an inline cite promotes its card to the active
	 * one — the scroll-spy effect above does the rest (highlight + scroll
	 * into view). Accepts both MouseEvent and FocusEvent. */
	function onBodyMouseOver(e: Event) {
		const target = (e.target as HTMLElement).closest?.('.cite-link') as HTMLElement | null;
		if (!target) return;
		const href = target.getAttribute('href') ?? '';
		const key = href.replace(/^#ref-/, '');
		if (key) activeCiteKey = key;
	}

	// Highlight a specific term when arriving from search — wraps the first
	// match in a <mark> and scrolls it into view.
	$effect(() => {
		const highlight = $page.url.searchParams.get('highlight');
		if (!highlight) return;

		setTimeout(() => {
			const body = document.querySelector('.doc-body');
			if (!body) return;

			const search = highlight.toLowerCase();
			const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
			let node: Node | null;

			while ((node = walker.nextNode())) {
				const text = node.textContent ?? '';
				const idx = text.toLowerCase().indexOf(search);
				if (idx === -1) continue;

				const range = document.createRange();
				range.setStart(node, idx);
				range.setEnd(node, idx + highlight.length);

				const mark = document.createElement('mark');
				mark.className = 'text-highlight';
				try {
					range.surroundContents(mark);
					mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
				} catch {
					// surroundContents fails if range spans multiple elements — skip
				}
				break;
			}
		}, 80);
	});

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

	function formatMeta(d: Date | string) {
		return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<svelte:document onclick={onDocClick} onkeydown={onDocKey} />

<div class="atelier">
	<header class="top-bar">
		<div class="top-bar-inner">
			<div class="brand">
				<BrandLogo height={26} />
				<span class="brand-sep">/</span>
				<a class="breadcrumb" href="/">{data.ws.name}</a>
			</div>

			<Search />

			<div class="actions">
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
				{#if data.frontmatter.public}
					<button class="action-btn" onclick={copyPublicLink}>
						{copied ? '✓ Copiado' : '⬡ Público'}
					</button>
				{/if}
				{#if data.frontmatter.formal}
					<button class="action-btn" onclick={() => (previewOpen = true)}>↓ PDF</button>
				{/if}
				<a href="/new?edit={data.slug}&ws={data.ws.id}" class="action-btn primary">Editar</a>
				<div class="more-wrap" class:menu-open={menuOpen} bind:this={menuWrapEl}>
					<button
						class="action-btn more-btn"
						onclick={() => (menuOpen = !menuOpen)}
						aria-label="Mais ações"
						aria-expanded={menuOpen}
					>⋯</button>
					{#if menuOpen}
						<div class="more-menu" role="menu" transition:popIn>
							<a href="/api/export/{data.slug}?format=md&ws={data.ws.id}" class="more-item" download>↓ Markdown</a>
							<a href="/api/export/{data.slug}?format=html&ws={data.ws.id}" class="more-item" download>↓ HTML</a>
							<hr/>
							<button class="more-item danger" onclick={deleteDoc}>Excluir</button>
						</div>
					{/if}
				</div>
				<UserMenu />
			</div>
		</div>
	</header>

	<div
		class="layout"
		class:no-left={!hasLeftRail}
		class:no-right={data.toc.length <= 2}
	>
		{#if hasLeftRail}
			<aside class="left-rail">
				{#if data.citedRefs.length > 0}
					<section class="marg">
						<p class="rail-head">Na margem</p>
						<div class="marg-list" bind:this={margListEl}>
							{#each data.citedRefs as ref (ref.key)}
								<article
									class="marg-card"
									class:is-active={activeCiteKey === ref.key}
									data-cite-key={ref.key}
								>
									<a href="#ref-{ref.key}" class="marg-link">
										<span class="marg-kind">Citação · {ref.key.toUpperCase()}</span>
										<span class="marg-label">{ref.label}</span>
										<span class="marg-title">{ref.title}</span>
									</a>
								</article>
							{/each}
						</div>
					</section>
				{/if}

				{#if data.backlinks.length > 0}
					<section class="backlinks">
						<p class="rail-head">Referenciado por</p>
						<ul class="backlinks-list">
							{#each data.backlinks as bl}
								<li><a href="/w/{data.ws.id}/{bl.slug}">{bl.title}</a></li>
							{/each}
						</ul>
					</section>
				{/if}
			</aside>
		{/if}

		<article class="article-scroll">
			<div class="meta-row">
				{#if data.frontmatter.formal}
					<span class="meta-chip">{data.frontmatter.doctype ?? 'documento formal'}</span>
				{/if}
				{#if data.frontmatter.public}
					<span class="meta-chip">público</span>
				{/if}
				{#if data.frontmatter.version}
					<span>v{data.frontmatter.version}</span>
				{/if}
				{#if data.frontmatter.date}
					<span class="meta-dot">·</span>
					<time>{formatMeta(data.frontmatter.date)}</time>
				{/if}
			</div>

			<h1 class="doc-title">{data.title}</h1>

			{#if data.frontmatter.description}
				<p class="doc-deck">{data.frontmatter.description}</p>
			{/if}

			<div class="doc-byline">
				{#if data.frontmatter.author}
					<div class="byline-field">
						<span class="byline-key">Autor</span>
						<span>{data.frontmatter.author}</span>
					</div>
				{/if}
				<div class="byline-field">
					<span class="byline-key">Modificado</span>
					<span>{formatMeta(data.mtime)}</span>
				</div>
				<div class="byline-field">
					<span class="byline-key">Leitura</span>
					<span>{data.wordCount.toLocaleString('pt-BR')} palavras · {data.readMinutes} min</span>
				</div>
				{#if data.frontmatter.tags?.length}
					<div class="byline-field">
						<span class="byline-key">Tags</span>
						<span class="byline-tags">
							{#each data.frontmatter.tags as tag}
								<a href="/?tag={encodeURIComponent(tag)}" class="byline-tag">{tag}</a>
							{/each}
						</span>
					</div>
				{/if}
			</div>

			<!-- svelte-ignore a11y_mouse_events_have_key_events -->
			<!-- We pair onmouseover with onfocusin (not onfocus) so the handler
			     catches keyboard navigation into any descendant .cite-link
			     without attaching listeners to every anchor. The rule doesn't
			     recognize focusin as the focus equivalent, hence the ignore. -->
			<div
				class="prose doc-body"
				onmouseover={onBodyMouseOver}
				onfocusin={onBodyMouseOver}
				role="presentation"
			>
				{@html data.html}
			</div>
		</article>

		{#if data.toc.length > 2}
			<aside class="toc-rail" bind:this={tocRailEl}>
				<p class="toc-head">Índice</p>
				<ol class="toc-list">
					{#each data.toc as entry}
						<li class="toc-level-{entry.level}" class:is-active={entry.id === activeTocId}>
							<a href="#{entry.id}">{entry.text}</a>
						</li>
					{/each}
				</ol>
			</aside>
		{/if}
	</div>
</div>

<!-- Floating jump-to-top affordance. Appears after ~one viewport of
     scroll; clicking smooth-scrolls to page zero. Keyed on showBackToTop
     so it fades in/out rather than popping. -->
<button
	type="button"
	class="back-to-top"
	class:is-visible={showBackToTop}
	onclick={scrollToTop}
	aria-label="Voltar ao topo"
	title="Voltar ao topo"
	tabindex={showBackToTop ? 0 : -1}
>
	<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<path d="M8 13V3M3 7l5-4 5 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
	</svg>
</button>

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

	/* ══════════════════════════════════════
	   Top bar
	═══════════════════════════════════════ */
	.top-bar {
		position: sticky;
		top: 0;
		z-index: 40;
		border-bottom: 1px solid var(--rule);
	}

	/* The frosted-glass background lives on a pseudo-element so
	   backdrop-filter doesn't create a containing block for fixed
	   descendants in Chromium — otherwise our mobile bottom nav (fixed
	   inside .actions) would anchor to the top bar's edge. */
	.top-bar::before {
		content: '';
		position: absolute;
		inset: 0;
		background: color-mix(in oklab, var(--bg) 88%, transparent);
		backdrop-filter: saturate(1.2) blur(10px);
		-webkit-backdrop-filter: saturate(1.2) blur(10px);
		z-index: -1;
	}

	.top-bar-inner {
		max-width: 1520px;
		margin: 0 auto;
		padding: 0 28px;
		height: 56px;
		display: grid;
		grid-template-columns: 260px 1fr auto;
		align-items: center;
		gap: 24px;
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-family: var(--font-serif-display);
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--ink);
		min-width: 0;
	}

	.brand-sep { color: var(--ink-muted); font-weight: 400; }

	.breadcrumb {
		font-family: var(--font-sans);
		font-size: 13px;
		color: var(--ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

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

	.more-wrap { position: relative; }
	.more-btn { width: 32px; padding: 0; justify-content: center; font-size: 18px; line-height: 0; }

	.more-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 180px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.2);
		padding: 4px;
		display: flex;
		flex-direction: column;
		z-index: 30;
	}

	.more-menu hr {
		border: 0;
		border-top: 1px solid var(--rule-soft);
		margin: 4px 2px;
	}

	.more-item {
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 13px;
		color: var(--ink-soft);
		text-align: left;
		background: transparent;
		border: 0;
		font-family: var(--font-sans);
	}

	.more-item:hover { background: var(--bg-deep); color: var(--ink); }
	.more-item.danger { color: oklch(0.5 0.18 25); }
	.more-item.danger:hover { background: oklch(0.95 0.03 25); }

	/* ══════════════════════════════════════
	   Layout
	═══════════════════════════════════════ */
	.layout {
		max-width: 1520px;
		margin: 0 auto;
		padding: 0 28px;
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr) 240px;
		gap: 48px;
		align-items: start;
	}

	/* Explicit column placement keeps the article in the center column
	   regardless of which rails are rendered. Missing rails leave their
	   columns empty (260px on the left, 240px on the right) so the
	   article's horizontal position is stable across doc types — a plain
	   argos doc centers at the same place as an academic one with cited
	   works in the margin. */
	.left-rail { grid-column: 1; }
	.article-scroll { grid-column: 2; }
	.toc-rail { grid-column: 3; }

	/* No-left case: drop the outer max-width cap and make the grid
	   flexible. The left "margin" column stretches or shrinks so the
	   article column can reach its full --reading-width (1200px) on wide
	   viewports but gracefully degrades on narrow ones. Without this the
	   1520px cap + rigid 260px left slot silently capped the article at
	   ~800px regardless of how large we set --reading-width. */
	.layout.no-left {
		--reading-width: 1200px;
		max-width: 1800px;
		grid-template-columns: minmax(40px, 1fr) minmax(0, var(--reading-width)) 240px;
	}

	.left-rail {
		position: sticky;
		top: 72px;
		max-height: calc(100vh - 88px);
		overflow-y: auto;
		padding: 28px 0 40px;
		font-family: var(--font-sans);
		font-size: 12.5px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.left-rail .rail-head {
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 0 0 10px;
		padding-left: 12px;
	}

	/* Na margem — one card per cited work, promoted to active on hover
	   and by the body scroll-spy. */
	.marg-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.marg-card {
		border-left: 2px solid transparent;
		transition: background 0.18s, border-color 0.18s;
	}

	.marg-card.is-active {
		background: var(--accent-soft);
		border-left-color: var(--accent);
	}

	.marg-link {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 12px;
		color: var(--ink);
		line-height: 1.4;
	}

	.marg-kind {
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.marg-card.is-active .marg-kind { color: var(--accent-ink); }

	.marg-label {
		font-family: var(--font-sans);
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ink);
	}

	.marg-title {
		font-family: var(--font-serif-body);
		font-style: italic;
		font-size: 12.5px;
		color: var(--ink-soft);
		text-wrap: pretty;
	}

	/* Backlinks — inbound wiki-links. Moved from the article bottom. */
	.backlinks {
		padding-top: 4px;
	}

	.backlinks-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.backlinks-list a {
		display: block;
		padding: 5px 12px;
		border-radius: 4px;
		color: var(--ink-soft);
		font-size: 12.5px;
		transition: color 0.15s, background 0.15s;
	}

	.backlinks-list a:hover {
		background: var(--bg-deep);
		color: var(--ink);
	}

	.article-scroll {
		padding: 48px 0 120px;
		min-width: 0;
	}

	.toc-rail {
		position: sticky;
		top: 72px;
		padding: 52px 0 40px;
		max-height: calc(100vh - 80px);
		overflow-y: auto;
		font-size: 12.5px;
		line-height: 1.5;
	}

	/* ══════════════════════════════════════
	   Article header
	═══════════════════════════════════════ */
	.meta-row {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--font-sans);
		font-size: 12px;
		color: var(--ink-muted);
		margin-bottom: 18px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.meta-chip {
		padding: 3px 8px;
		background: var(--chip-bg);
		border-radius: 999px;
		letter-spacing: 0.08em;
	}

	.meta-dot { color: var(--ink-muted); }

	.doc-title {
		font-family: var(--font-serif-display);
		font-size: 56px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.02;
		/* opsz 120 pushes Fraunces into its display range — hairlines go
		   thin, the thick/thin contrast ramps up, and the serifs sharpen
		   into the Didone look the prototype shows. SOFT axis omitted so
		   the stems stay squared. */
		font-variation-settings: 'opsz' 120;
		margin: 0 0 6px;
		max-width: var(--reading-width);
		text-wrap: balance;
	}

	.doc-deck {
		font-family: var(--font-serif-body);
		font-size: 20px;
		line-height: 1.45;
		color: var(--ink-soft);
		max-width: var(--reading-width);
		font-style: italic;
		font-weight: 400;
		margin: 0 0 32px;
		text-wrap: pretty;
	}

	.doc-byline {
		display: flex;
		flex-wrap: wrap;
		gap: 24px;
		align-items: baseline;
		padding: 14px 0;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		font-size: 13px;
		color: var(--ink-soft);
		margin-bottom: 40px;
		max-width: var(--reading-width);
	}

	.byline-field { display: flex; flex-direction: column; gap: 2px; }

	.byline-key {
		font-family: var(--font-sans);
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.byline-tags { display: inline-flex; gap: 6px; flex-wrap: wrap; }

	.byline-tag {
		padding: 1px 8px;
		background: var(--chip-bg);
		border-radius: 999px;
		font-size: 12px;
		color: var(--ink-soft);
	}

	.byline-tag:hover { background: var(--accent-soft); color: var(--accent-ink); }

	/* ══════════════════════════════════════
	   Prose — serif body, Atelier rhythm
	═══════════════════════════════════════ */
	:global(.prose.doc-body) {
		max-width: var(--reading-width);
		font-family: var(--font-serif-body);
		font-size: 18px;
		line-height: 1.65;
		color: var(--ink);
		font-variation-settings: 'opsz' 18;
	}

	:global(.prose.doc-body h1) { display: none; }

	:global(.prose.doc-body h2) {
		font-family: var(--font-serif-display);
		font-weight: 500;
		font-size: 32px;
		letter-spacing: -0.015em;
		line-height: 1.15;
		margin: 72px 0 20px;
		scroll-margin-top: 80px;
		font-variation-settings: 'opsz' 60;
		color: var(--ink);
	}

	:global(.prose.doc-body h2::before) {
		content: '§';
		color: var(--ink-muted);
		font-size: 22px;
		margin-right: 10px;
		font-weight: 400;
		vertical-align: 2px;
	}

	:global(.prose.doc-body h3) {
		font-family: var(--font-serif-display);
		font-weight: 600;
		font-size: 21px;
		line-height: 1.25;
		margin: 40px 0 12px;
		scroll-margin-top: 80px;
		color: var(--ink);
	}

	:global(.prose.doc-body h4) {
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin: 28px 0 10px;
	}

	:global(.prose.doc-body p) {
		margin: 0 0 18px;
		text-wrap: pretty;
	}

	:global(.prose.doc-body ul), :global(.prose.doc-body ol) {
		margin: 0 0 22px;
		padding-left: 1.4em;
	}

	:global(.prose.doc-body li) { margin-bottom: 6px; }
	:global(.prose.doc-body ul li::marker) { color: var(--ink-muted); }

	:global(.prose.doc-body strong) {
		font-weight: 600;
		color: var(--ink);
		font-variation-settings: 'opsz' 18, 'wght' 620;
	}

	:global(.prose.doc-body em) { font-style: italic; }

	:global(.prose.doc-body a) {
		color: var(--accent-ink);
		border-bottom: 1px solid var(--accent-soft);
		transition: border-color 0.15s, color 0.15s;
	}

	:global(.prose.doc-body a:hover) {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	:global(.prose.doc-body a.wiki-link) {
		color: var(--accent-ink);
		background: var(--accent-soft);
		padding: 1px 6px;
		border-radius: 3px;
		border: 0;
	}

	:global(.prose.doc-body hr) {
		border: 0;
		border-top: 1px solid var(--rule);
		margin: 40px 0;
	}

	:global(.prose.doc-body blockquote) {
		margin: 24px 0;
		padding: 4px 20px;
		border-left: 3px solid var(--accent);
		color: var(--ink-soft);
		font-style: italic;
	}

	/* Inline code */
	:global(.prose.doc-body :not(pre) > code) {
		font-family: var(--font-mono);
		font-size: 0.84em;
		padding: 1px 6px;
		background: var(--code-bg);
		border: 1px solid var(--rule-soft);
		border-radius: 4px;
		color: var(--code-ink);
		white-space: nowrap;
	}

	/* Code block — dark slab with a subtle chrome bar on top */
	:global(.prose.doc-body pre) {
		margin: 24px 0 28px;
		padding: 0;
		background: oklch(0.24 0.012 82);
		border-radius: 10px;
		overflow: hidden;
		position: relative;
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.55;
		color: oklch(0.88 0.008 82);
		max-width: calc(var(--reading-width) + 120px);
		border: 1px solid oklch(0.22 0.012 82);
	}

	:global(.prose.doc-body pre::before) {
		content: '';
		display: block;
		height: 28px;
		background: oklch(0.2 0.012 82);
		border-bottom: 1px solid oklch(0.3 0.012 82);
	}

	:global(.prose.doc-body pre > code) {
		display: block;
		padding: 14px 18px 18px;
		background: transparent;
		border: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		color: inherit;
		white-space: pre;
		overflow-x: auto;
	}

	/* Tables */
	:global(.prose.doc-body .table-wrap) {
		max-width: calc(var(--reading-width) + 120px);
		margin: 20px 0 28px;
		overflow-x: auto;
	}

	:global(.prose.doc-body table) {
		width: 100%;
		font-family: var(--font-sans);
		font-size: 14px;
		line-height: 1.45;
		border-collapse: collapse;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		overflow: hidden;
	}

	:global(.prose.doc-body th),
	:global(.prose.doc-body td) {
		padding: 10px 14px;
		text-align: left;
		vertical-align: top;
		border-bottom: 1px solid var(--rule-soft);
	}

	:global(.prose.doc-body th) {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-soft);
		background: var(--bg-deep);
		border-bottom: 1px solid var(--rule);
	}

	:global(.prose.doc-body tr:last-child td) { border-bottom: 0; }

	/* Mermaid */
	:global(.prose.doc-body pre.mermaid) {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 10px;
		padding: 28px;
		text-align: center;
		max-width: calc(var(--reading-width) + 120px);
	}

	:global(.prose.doc-body pre.mermaid::before) { display: none; }
	:global(.prose.doc-body pre.mermaid code) { padding: 0; }

	/* Highlight from search */
	:global(.text-highlight) {
		background: color-mix(in oklab, var(--accent) 40%, transparent);
		padding: 0 2px;
		border-radius: 2px;
	}

	/* ══════════════════════════════════════
	   TOC rail (right)
	═══════════════════════════════════════ */
	.toc-head {
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 0 0 12px;
		padding-left: 12px;
	}

	.toc-list {
		list-style: none;
		padding: 0;
		margin: 0;
		position: relative;
	}

	.toc-list::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--rule);
	}

	.toc-list li a {
		display: block;
		padding: 3px 12px;
		color: var(--ink-muted);
		border-left: 2px solid transparent;
		margin-left: -1px;
		transition: color 0.15s, border-color 0.15s;
		font-family: var(--font-sans);
		font-size: 12.5px;
		line-height: 1.5;
	}

	.toc-list li a:hover { color: var(--ink); }

	.toc-list li.is-active > a {
		color: var(--accent-ink);
		border-left-color: var(--accent);
		font-weight: 500;
	}

	.toc-list .toc-level-1 { display: none; }
	.toc-list .toc-level-2 > a { font-weight: 500; color: var(--ink-soft); }
	.toc-list .toc-level-3 > a { padding-left: 24px; font-size: 12px; }
	.toc-list .toc-level-4 > a { padding-left: 36px; font-size: 12px; }

	/* Inline citation chips inside the prose body. The engine emits
	   <span class="cite cite-{style}"><a class="cite-link" href="#ref-x">…</a></span>
	   for each group. Keep the chip subtle — the author-year or [N]
	   carries the signal; we just make it clickable and distinct. */
	:global(.prose.doc-body .cite) {
		color: var(--accent-ink);
		font-variant-numeric: lining-nums tabular-nums;
	}

	:global(.prose.doc-body .cite-link) {
		color: inherit;
		border-bottom: 1px dotted var(--accent-soft);
		text-decoration: none;
		transition: border-color 0.15s;
	}

	:global(.prose.doc-body .cite-link:hover) {
		border-bottom-color: var(--accent);
	}

	/* Smooth-scroll the reference target into view clear of the sticky
	   top bar. scroll-margin-top is load-bearing — without it #ref-foo
	   jumps land behind the 56px header. */
	:global(.prose.doc-body .reference-entry) {
		scroll-margin-top: 88px;
	}

	/* Auto-generated references section — slightly darker rule on top so
	   it visually separates from the final body paragraph. */
	:global(.prose.doc-body .references-section) {
		margin-top: 56px;
		padding-top: 24px;
		border-top: 1px solid var(--rule);
	}

	:global(.prose.doc-body .references-heading) {
		font-family: var(--font-serif-display);
		font-size: 20px;
		font-weight: 500;
		letter-spacing: -0.01em;
		margin: 0 0 20px;
		color: var(--ink);
	}

	:global(.prose.doc-body .references-list) {
		list-style: none;
		padding-left: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	:global(.prose.doc-body .references-list li) {
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-soft);
	}

	/* Smooth anchor scrolling across the app so cite clicks glide. */
	:global(html) { scroll-behavior: smooth; }

	/* ══════════════════════════════════════
	   Search slot — Search component sits center
	═══════════════════════════════════════ */
	:global(.top-bar-inner .search-wrap) {
		justify-self: center;
		width: 100%;
		max-width: 520px;
	}

	/* ══════════════════════════════════════
	   Back-to-top — fixed bottom-right, out of the article's reading
	   path and clear of the top bar. Slides left to avoid the AI dock
	   when it's open (body gets padding-right: 380px, but fixed
	   elements don't inherit that, so we reposition manually).
	═══════════════════════════════════════ */
	.back-to-top {
		position: fixed;
		bottom: 24px;
		right: 24px;
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--rule);
		color: var(--ink-soft);
		box-shadow: 0 8px 22px -10px rgba(0, 0, 0, 0.28);
		cursor: pointer;
		z-index: 50;
		opacity: 0;
		transform: translateY(8px) scale(0.92);
		pointer-events: none;
		transition: opacity 0.18s, transform 0.18s, right 0.28s cubic-bezier(0.2, 0.7, 0.2, 1), color 0.15s, border-color 0.15s;
	}

	.back-to-top.is-visible {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	.back-to-top:hover {
		color: var(--accent-ink);
		border-color: var(--accent);
	}

	:global(body.ai-open) .back-to-top { right: calc(380px + 24px); }

	/* ══════════════════════════════════════
	   Responsive
	═══════════════════════════════════════ */
	@media (max-width: 1200px) {
		.layout {
			grid-template-columns: 220px minmax(0, 1fr);
			padding: 0 20px;
			gap: 32px;
		}
		.layout.no-left { grid-template-columns: minmax(0, 1fr); }
		.left-rail { grid-column: 1; }
		.article-scroll { grid-column: 2; }
		.layout.no-left .article-scroll { grid-column: 1; }
		.toc-rail { display: none; }
	}

	@media (max-width: 860px) {
		.layout { grid-template-columns: minmax(0, 1fr); }
		.article-scroll { grid-column: 1; }
		.left-rail { display: none; }
		.top-bar-inner {
			grid-template-columns: auto 1fr auto;
			height: auto;
			padding: 10px 14px;
			gap: 10px;
		}
		.doc-title { font-size: 40px; }
	}

	/* ══════════════════════════════════════
	   Mobile bottom nav — same pattern as the home route. The viewer's
	   actions cluster (AI toggle, PDF, Editar, kebab, UserMenu) moves
	   from the top bar's right slot to a fixed bottom bar.
	═══════════════════════════════════════ */
	@media (max-width: 640px) {
		.atelier { padding-bottom: 68px; }

		/* `.actions` goes fixed below → collapse the top bar to 2 cols
		   so the search field gets the full remaining width. */
		.top-bar-inner { grid-template-columns: auto minmax(0, 1fr); }
		.brand { min-width: 0; flex-shrink: 1; }
		.brand :global(.brand-text) { display: none; }
		.breadcrumb { max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

		.actions {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
			background: var(--bg);
			border-top: 1px solid var(--rule);
			justify-content: space-around;
			gap: 2px;
			z-index: 40;
			box-shadow: 0 -12px 24px -16px rgba(0, 0, 0, 0.12);
		}

		/* "Editar" loses its text label on mobile — the pencil-like
		   accent background is the recognizable affordance. */
		.action-btn.primary { padding: 0 14px; height: 36px; }

		/* Pop back-to-top above the nav AND flip to the left edge so it
		   doesn't collide with the upward-opening UserMenu dropdown
		   (which pops from the rightmost button in .actions). */
		.back-to-top {
			bottom: calc(68px + 16px);
			left: 24px;
			right: auto;
		}

		/* Triggers sit at viewport bottom → menus must open upward
		   or they render off-screen. Kebab `.more-menu` is local; the
		   UserMenu `.dropdown` is scoped to its own component, so
		   :global() is required to pierce Svelte's scoping. */
		.more-menu {
			top: auto;
			bottom: calc(100% + 6px);
			transform-origin: bottom right;
		}

		.actions :global(.dropdown) {
			top: auto;
			bottom: calc(100% + 0.5rem);
			transform-origin: bottom right;
		}
	}
</style>
