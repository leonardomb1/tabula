<script lang="ts">
	import { page } from '$app/stores';

	type TocEntry = { level: number; id: string; text: string };
	type CitedRef = { key: string; label: string; title: string };
	type Backlink = { slug: string; title: string };
	type Frontmatter = {
		public?: boolean;
		formal?: boolean;
		doctype?: string;
		version?: string;
		date?: string | Date | null;
		description?: string;
		author?: string | string[];
		tags?: string[];
	};

	export interface Doc {
		title: string;
		html: string;
		toc: TocEntry[];
		frontmatter: Frontmatter;
		mtime: string | Date;
		wordCount: number;
		readMinutes: number;
	}

	let {
		doc,
		citedRefs = [],
		backlinks = [],
		wsId = null
	}: {
		doc: Doc;
		citedRefs?: CitedRef[];
		backlinks?: Backlink[];
		/** Required to render backlinks (they link into /w/<ws>/…). Pass null on public to hide them. */
		wsId?: string | null;
	} = $props();

	let activeTocId = $state<string | null>(null);
	let activeCiteKey = $state<string | null>(null);
	let margListEl = $state<HTMLElement | null>(null);
	let tocRailEl = $state<HTMLElement | null>(null);
	let showBackToTop = $state(false);

	// Collapse the left column when neither citations nor backlinks exist —
	// otherwise the 260px slot would leave the article offset to the right.
	const hasLeftRail = $derived(
		citedRefs.length > 0 || (wsId !== null && backlinks.length > 0)
	);

	// Render the authors list as a single comma-separated string regardless of
	// whether frontmatter.author came in as a scalar or an array.
	const authorText = $derived.by(() => {
		const a = doc.frontmatter.author;
		if (!a) return null;
		return Array.isArray(a) ? a.join(', ') : a;
	});

	// Mermaid — re-render whenever the doc body changes. Narrow containers
	// sometimes throw layout errors inside mermaid; swallow so the raw
	// fenced code stays on screen instead of blowing up the page.
	$effect(() => {
		doc.html;
		import('mermaid').then(({ default: mermaid }) => {
			mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
			mermaid.run({ querySelector: '.mermaid' }).catch(() => {});
		});
	});

	// Scroll-spy for the right-rail TOC. Scroll events (not IntersectionObserver)
	// so we can pick the *last* heading above the reading-zone threshold —
	// IO alone can leave the first visible heading stuck selected after it's
	// scrolled past the top.
	$effect(() => {
		doc.html;
		const headings = Array.from(
			document.querySelectorAll('.doc-body :is(h1, h2, h3, h4)[id]')
		) as HTMLElement[];
		if (headings.length === 0) return;

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

	// Scroll-spy for the left-rail "Na margem" citation cards — last inline
	// cite that scrolled past the threshold becomes active.
	$effect(() => {
		doc.html;
		if (citedRefs.length === 0) return;

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

	// Keep the active marginalia card in view within the rail (not the page).
	$effect(() => {
		activeCiteKey;
		if (!activeCiteKey || !margListEl) return;
		const card = margListEl.querySelector<HTMLElement>(
			`[data-cite-key="${CSS.escape(activeCiteKey)}"]`
		);
		if (!card) return;
		const railBox = margListEl.getBoundingClientRect();
		const cardBox = card.getBoundingClientRect();
		if (cardBox.top < railBox.top || cardBox.bottom > railBox.bottom) {
			card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	// Same pattern for the right-rail TOC on long docs.
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

	// Back-to-top visibility — appears after ~one viewport of scroll.
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

	/** Hovering / focusing a cite promotes its card to active — scroll-spy
	 * handles the rest (highlight + scroll-into-view). onfocusin catches
	 * keyboard nav into descendants without per-anchor listeners. */
	function onBodyMouseOver(e: Event) {
		const target = (e.target as HTMLElement).closest?.('.cite-link') as HTMLElement | null;
		if (!target) return;
		const href = target.getAttribute('href') ?? '';
		const key = href.replace(/^#ref-/, '');
		if (key) activeCiteKey = key;
	}

	// Search highlight — wrap the first match of ?highlight=term in a
	// <mark> and scroll it into view. Ignored when the range straddles
	// multiple elements (surroundContents throws).
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
					// range spans multiple elements — skip
				}
				break;
			}
		}, 80);
	});

	function formatMeta(d: Date | string) {
		return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

<div
	class="layout"
	class:no-left={!hasLeftRail}
	class:no-right={doc.toc.length <= 2}
>
	{#if hasLeftRail}
		<aside class="left-rail">
			{#if citedRefs.length > 0}
				<section class="marg">
					<p class="rail-head">Na margem</p>
					<div class="marg-list" bind:this={margListEl}>
						{#each citedRefs as ref (ref.key)}
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

			{#if wsId && backlinks.length > 0}
				<section class="backlinks">
					<p class="rail-head">Referenciado por</p>
					<ul class="backlinks-list">
						{#each backlinks as bl}
							<li><a href="/w/{wsId}/{bl.slug}">{bl.title}</a></li>
						{/each}
					</ul>
				</section>
			{/if}
		</aside>
	{/if}

	<article class="article-scroll">
		<div class="meta-row">
			{#if doc.frontmatter.formal}
				<span class="meta-chip">{doc.frontmatter.doctype ?? 'documento formal'}</span>
			{/if}
			{#if doc.frontmatter.public}
				<span class="meta-chip">público</span>
			{/if}
			{#if doc.frontmatter.version}
				<span>v{doc.frontmatter.version}</span>
			{/if}
			{#if doc.frontmatter.date}
				<span class="meta-dot">·</span>
				<time>{formatMeta(doc.frontmatter.date)}</time>
			{/if}
		</div>

		<h1 class="doc-title">{doc.title}</h1>

		{#if doc.frontmatter.description}
			<p class="doc-deck">{doc.frontmatter.description}</p>
		{/if}

		<div class="doc-byline">
			{#if authorText}
				<div class="byline-field">
					<span class="byline-key">Autor</span>
					<span>{authorText}</span>
				</div>
			{/if}
			<div class="byline-field">
				<span class="byline-key">Modificado</span>
				<span>{formatMeta(doc.mtime)}</span>
			</div>
			<div class="byline-field">
				<span class="byline-key">Leitura</span>
				<span>{doc.wordCount.toLocaleString('pt-BR')} palavras · {doc.readMinutes} min</span>
			</div>
			{#if doc.frontmatter.tags?.length}
				<div class="byline-field">
					<span class="byline-key">Tags</span>
					<span class="byline-tags">
						{#each doc.frontmatter.tags as tag}
							<a href="/?tag={encodeURIComponent(tag)}" class="byline-tag">{tag}</a>
						{/each}
					</span>
				</div>
			{/if}
		</div>

		<!-- svelte-ignore a11y_mouse_events_have_key_events -->
		<!-- onfocusin catches keyboard nav into .cite-link descendants without
		     per-anchor listeners. The lint rule doesn't recognize focusin as
		     the focus equivalent. -->
		<div
			class="prose doc-body"
			onmouseover={onBodyMouseOver}
			onfocusin={onBodyMouseOver}
			role="presentation"
		>
			{@html doc.html}
		</div>
	</article>

	{#if doc.toc.length > 2}
		<aside class="toc-rail" bind:this={tocRailEl}>
			<p class="toc-head">Índice</p>
			<ol class="toc-list">
				{#each doc.toc as entry}
					<li class="toc-level-{entry.level}" class:is-active={entry.id === activeTocId}>
						<a href="#{entry.id}">{entry.text}</a>
					</li>
				{/each}
			</ol>
		</aside>
	{/if}
</div>

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

<style>
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

	.left-rail { grid-column: 1; }
	.article-scroll { grid-column: 2; }
	.toc-rail { grid-column: 3; }

	/* No-left case: drop the outer max-width cap and make the grid flexible
	   so the article can reach --reading-width on wide viewports. */
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

	/* Na margem — one card per cited work, active on hover & scroll-spy. */
	.marg-list { display: flex; flex-direction: column; gap: 6px; }

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

	.backlinks { padding-top: 4px; }

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

	.backlinks-list a:hover { background: var(--bg-deep); color: var(--ink); }

	.article-scroll { padding: 48px 0 120px; min-width: 0; }

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
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.02;
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
		text-align: justify;
		text-wrap: pretty;
		/* Without hyphenation, justify creates large inter-word gaps on
		   narrow lines. Hyphens: auto needs a lang attribute on the
		   content tree to pick the right dictionary; we set it on the
		   body element from the doc's frontmatter when available. */
		hyphens: auto;
		-webkit-hyphens: auto;
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

	:global(.prose.doc-body pre) {
		margin: 24px 0 28px;
		padding: 14px 18px;
		background: var(--code-surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink);
		max-width: calc(var(--reading-width) + 120px);
	}

	:global(.prose.doc-body pre > code) {
		display: block;
		padding: 0;
		background: transparent;
		border: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		color: inherit;
		white-space: pre;
	}

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

	:global(.toc-list .toc-level-1) { display: none; }
	:global(.toc-list .toc-level-2 > a) { font-weight: 500; color: var(--ink-soft); }
	:global(.toc-list .toc-level-3 > a) { padding-left: 24px; font-size: 12px; }
	:global(.toc-list .toc-level-4 > a) { padding-left: 36px; font-size: 12px; }

	/* Inline citations inside the prose body. */
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

	:global(.prose.doc-body .cite-link:hover) { border-bottom-color: var(--accent); }

	/* Clear the sticky top bar when #ref-… jumps land on a reference entry. */
	:global(.prose.doc-body .reference-entry) { scroll-margin-top: 88px; }

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

	:global(html) { scroll-behavior: smooth; }

	/* ══════════════════════════════════════
	   Back-to-top — fixed bottom-right, slides left when the AI dock opens.
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
		.doc-title { font-size: 40px; }
	}

	@media (max-width: 640px) {
		/* Sits above the fixed bottom nav, right-aligned. The old "flip to
		   left" workaround collided with the workspace-list scroll on
		   the home page — right is the expected side. */
		.back-to-top { bottom: calc(68px + 16px); }
	}
</style>
