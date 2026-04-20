<script lang="ts">
	import { page } from '$app/stores';
	import { docPath } from './ids';
	import { swipeToClose } from './swipeToClose';

	import type { Snippet } from 'svelte';

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
		wsId = null,
		mobileActions
	}: {
		doc: Doc;
		citedRefs?: CitedRef[];
		backlinks?: Backlink[];
		/** Required to render backlinks (they link into /w/<ws>/…). Pass null on public to hide them. */
		wsId?: string | null;
		/** Content of the "Ações" tab in the mobile bottom sheet. The authed
		 * viewer passes action rows here (Editar, Exportar, etc); public
		 * viewer omits this prop and the tab is hidden. */
		mobileActions?: Snippet;
	} = $props();

	let activeTocId = $state<string | null>(null);
	let activeCiteKey = $state<string | null>(null);
	let margListEl = $state<HTMLElement | null>(null);
	let tocRailEl = $state<HTMLElement | null>(null);
	let showBackToTop = $state(false);

	// Mobile bottom sheet — opens on FAB tap or citation-superscript tap.
	// The tab prop is ignored on desktop (the sheet isn't rendered there).
	type SheetTab = 'actions' | 'toc' | 'cites';
	let sheetOpen = $state(false);
	let activeSheetTab = $state<SheetTab>('actions');

	function openSheet(tab: SheetTab = 'actions') {
		// Fall back gracefully if a caller asks for a tab that isn't available
		// (e.g. public viewer has no actions, or doc has no toc).
		const fallback: SheetTab = mobileActions
			? 'actions'
			: doc.toc.length > 2
				? 'toc'
				: 'cites';
		const hasTab =
			(tab === 'actions' && mobileActions) ||
			(tab === 'toc' && doc.toc.length > 2) ||
			(tab === 'cites' && citedRefs.length > 0);
		activeSheetTab = hasTab ? tab : fallback;
		sheetOpen = true;
	}
	function closeSheet() { sheetOpen = false; }

	// Escape closes the sheet. Placed here (not in an action) because the
	// sheet's open/closed state needs to be readable.
	$effect(() => {
		if (!sheetOpen) return;
		function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeSheet(); }
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Citation-superscript taps in the rendered body should open the sheet
	// directly on the citations tab. The body is {@html}-injected, so we
	// listen at the container level and filter by click target.
	function onBodyClickMobile(e: MouseEvent) {
		if (window.innerWidth > 1024) return;
		const target = (e.target as HTMLElement).closest?.('.cite-link, sup.cite') as HTMLElement | null;
		if (!target) return;
		e.preventDefault();
		openSheet('cites');
	}

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

	// One entry per author — 2-letter initials ("Leonardo Machado Baptista"
	// → "LB") plus the original name for aria-label. Splits comma-separated
	// scalars so legacy `author: "A, B"` frontmatter renders as two people.
	const authorEntries = $derived.by(() => {
		const a = doc.frontmatter.author;
		if (!a) return [] as { name: string; initials: string }[];
		const list = Array.isArray(a)
			? a
			: String(a).split(/\s*,\s*/).filter(Boolean);
		return list.map((name) => {
			const parts = String(name).trim().split(/\s+/);
			const head = parts[0]?.[0] ?? '';
			const tail = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
			return { name, initials: (head + tail).toUpperCase() || '·' };
		});
	});

	// Kicker line on mobile — "● DOCUMENTO FORMAL · 18 DE ABR. DE 2026".
	// `doctype` overrides the generic label when present; date falls back
	// to mtime so the kicker always has a temporal anchor.
	const kickerLabel = $derived(
		(doc.frontmatter.doctype ?? (doc.frontmatter.formal ? 'Documento formal' : 'Documento')).toUpperCase()
	);
	const kickerDate = $derived.by(() => {
		const d = doc.frontmatter.date ?? doc.mtime;
		return d ? formatMeta(d).toUpperCase() : null;
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
							<li><a href={docPath(wsId, bl.slug, bl.title)}>{bl.title}</a></li>
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

		<div class="kicker-row" aria-hidden="true">
			<span class="kicker-lead"><span class="kicker-dot">●</span> {kickerLabel}</span>
			{#if kickerDate}
				<span class="kicker-sep">·</span>
				<span class="kicker-date">{kickerDate}</span>
			{/if}
		</div>

		<h1 class="doc-title">{doc.title}</h1>

		{#if doc.frontmatter.description}
			<p class="doc-deck">{doc.frontmatter.description}</p>
		{/if}

		<div class="author-strip">
			{#if authorEntries.length > 0}
				<div
					class="author-avatars"
					class:is-stack={authorEntries.length > 1}
					aria-hidden="true"
				>
					{#each authorEntries.slice(0, 3) as entry}
						<span class="author-avatar" title={entry.name}>{entry.initials}</span>
					{/each}
					{#if authorEntries.length > 3}
						<span class="author-avatar is-more">+{authorEntries.length - 3}</span>
					{/if}
				</div>
			{/if}
			<div class="author-names">{authorText ?? 'Sem autor'}</div>
			<div class="author-time">{doc.readMinutes} min</div>
		</div>

		<div class="doc-byline">
			{#if authorText}
				<div class="byline-field">
					<span class="byline-key">{authorEntries.length > 1 ? 'Autores' : 'Autor'}</span>
					<span class="byline-author">
						{#if authorEntries.length > 0}
							<span
								class="author-avatars byline-avatars"
								class:is-stack={authorEntries.length > 1}
								aria-hidden="true"
							>
								{#each authorEntries.slice(0, 3) as entry}
									<span class="author-avatar" title={entry.name}>{entry.initials}</span>
								{/each}
								{#if authorEntries.length > 3}
									<span class="author-avatar is-more">+{authorEntries.length - 3}</span>
								{/if}
							</span>
						{/if}
						<span>{authorText}</span>
					</span>
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
			onclick={onBodyClickMobile}
			role="presentation"
		>
			{@html doc.html}
		</div>

		{#if doc.frontmatter.tags?.length}
			<section class="tag-cloud">
				<p class="tag-cloud__label">Tags</p>
				<div class="tag-cloud__list">
					{#each doc.frontmatter.tags as tag}
						<a href="/?tag={encodeURIComponent(tag)}" class="tag-cloud__chip">{tag}</a>
					{/each}
				</div>
			</section>
		{/if}
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

<!-- ════════════════════════════════════════
     Mobile FAB + bottom sheet
     Consolidates actions, TOC, and citations under a single entry
     point on phone and iPad-portrait viewports. Hidden above 1024px — the
     desktop rails + top-bar actions cover the same territory there.
════════════════════════════════════════ -->
<button
	type="button"
	class="fab"
	class:is-hidden={sheetOpen}
	onclick={() => openSheet()}
	aria-label="Menu do documento"
	aria-expanded={sheetOpen}
>
	<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path d="M5 6h14M5 12h14M5 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
	</svg>
</button>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="scrim"
	class:is-open={sheetOpen}
	onclick={closeSheet}
	aria-hidden="true"
></div>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section
	class="sheet"
	class:is-open={sheetOpen}
	role="dialog"
	aria-modal="true"
	aria-label="Menu do documento"
	aria-hidden={!sheetOpen}
	use:swipeToClose={{ anchor: 'bottom', onClose: closeSheet, handle: '.sheet-grabber', enabled: sheetOpen }}
>
	<div class="sheet-grabber" aria-hidden="true"><span class="sheet-grabber__bar"></span></div>

	<div class="sheet-tabs" role="tablist">
		{#if mobileActions}
			<button
				type="button"
				role="tab"
				class="sheet-tab"
				class:is-active={activeSheetTab === 'actions'}
				aria-selected={activeSheetTab === 'actions'}
				onclick={() => (activeSheetTab = 'actions')}
			>Ações</button>
		{/if}
		{#if doc.toc.length > 2}
			<button
				type="button"
				role="tab"
				class="sheet-tab"
				class:is-active={activeSheetTab === 'toc'}
				aria-selected={activeSheetTab === 'toc'}
				onclick={() => (activeSheetTab = 'toc')}
			>Índice</button>
		{/if}
		{#if citedRefs.length > 0}
			<button
				type="button"
				role="tab"
				class="sheet-tab"
				class:is-active={activeSheetTab === 'cites'}
				aria-selected={activeSheetTab === 'cites'}
				onclick={() => (activeSheetTab = 'cites')}
			>Na margem</button>
		{/if}
	</div>

	<div class="sheet-body">
		{#if mobileActions && activeSheetTab === 'actions'}
			<div class="sheet-panel">{@render mobileActions()}</div>
		{/if}

		{#if doc.toc.length > 2 && activeSheetTab === 'toc'}
			<ol class="sheet-toc">
				{#each doc.toc as entry}
					<li class="sheet-toc__item sheet-toc__item--level-{entry.level}">
						<a href="#{entry.id}" onclick={closeSheet}>{entry.text}</a>
					</li>
				{/each}
			</ol>
		{/if}

		{#if citedRefs.length > 0 && activeSheetTab === 'cites'}
			<div class="sheet-cites">
				{#each citedRefs as ref (ref.key)}
					<a
						href="#ref-{ref.key}"
						class="sheet-cite"
						class:is-active={activeCiteKey === ref.key}
						onclick={closeSheet}
					>
						<span class="sheet-cite__tag">Citação · {ref.key.toUpperCase()}</span>
						<span class="sheet-cite__label">{ref.label}</span>
						<span class="sheet-cite__title">{ref.title}</span>
					</a>
				{/each}
				{#if wsId && backlinks.length > 0}
					<p class="sheet-cites__sep">Referenciado por</p>
					<ul class="sheet-backlinks">
						{#each backlinks as bl}
							<li><a href={docPath(wsId, bl.slug, bl.title)} onclick={closeSheet}>{bl.title}</a></li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</div>
</section>

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

	/* Value row of the Autor/Autores field: avatar stack to the left of the
	   names. `align-items: center` so the circle and the text baseline sit
	   together despite the line-height difference. */
	.byline-author { display: inline-flex; align-items: center; gap: 8px; }

	/* Author avatars — used both by the mobile .author-strip (30px) and by
	   the desktop .doc-byline (22px via .byline-avatars). Stack overlap rings
	   in the bg so overlapping circles read as distinct discs. */
	.author-avatars { display: flex; flex-shrink: 0; }
	.author-avatars.is-stack .author-avatar { box-shadow: 0 0 0 2px var(--bg); }
	.author-avatars.is-stack .author-avatar + .author-avatar { margin-left: -10px; }
	.byline-avatars.is-stack .author-avatar + .author-avatar { margin-left: -7px; }

	.author-avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--bg, #fff);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.02em;
		flex-shrink: 0;
	}
	.author-avatar.is-more {
		background: var(--surface);
		color: var(--ink-soft);
		border: 1px solid var(--rule);
	}
	.byline-avatars .author-avatar {
		width: 22px;
		height: 22px;
		font-size: 9px;
	}

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
		/* Fill the wrapper when content fits, but let the table grow past it
		   (and scroll inside `.table-wrap`) when cells demand more room —
		   avoids the mobile "everything breaks character-by-character" look. */
		width: auto;
		min-width: 100%;
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
	   Mobile-only header elements — hidden by default, unveiled below 1024px
	   in place of the desktop meta-row / doc-byline.
	═══════════════════════════════════════ */
	.kicker-row,
	.author-strip,
	.tag-cloud { display: none; }

	/* ══════════════════════════════════════
	   FAB + bottom sheet — mobile-only (display:none above 1024px). FAB is
	   always in the tree so Svelte transitions don't hiccup on first open.
	═══════════════════════════════════════ */
	.fab {
		display: none;
		position: fixed;
		right: 16px;
		bottom: calc(env(safe-area-inset-bottom) + 20px);
		width: 56px;
		height: 56px;
		border-radius: 28px;
		background: var(--ink);
		color: var(--bg);
		align-items: center;
		justify-content: center;
		border: 0;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.10);
		z-index: 70;
		cursor: pointer;
		transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms;
	}
	.fab:active { transform: scale(0.96); }
	.fab.is-hidden {
		transform: translateY(90px);
		opacity: 0;
		pointer-events: none;
	}

	.scrim {
		display: none;
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 80;
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms ease;
	}
	.scrim.is-open { opacity: 1; pointer-events: auto; }

	.sheet {
		display: none;
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 90;
		background: var(--bg);
		border-top: 1px solid var(--rule);
		border-top-left-radius: 22px;
		border-top-right-radius: 22px;
		box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
		max-height: 78dvh;
		flex-direction: column;
		padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
		transform: translateY(100%);
		transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.sheet.is-open { transform: translateY(0); }
	:global(.sheet[data-dragging]) { transition: none; }

	.sheet-grabber {
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 8px 0 4px;
		flex-shrink: 0;
		cursor: grab;
		touch-action: none;
	}
	.sheet-grabber:active { cursor: grabbing; }
	.sheet-grabber__bar {
		display: block;
		height: 4px;
		width: 36px;
		border-radius: 2px;
		background: var(--rule);
	}

	.sheet-tabs {
		display: flex;
		gap: 3px;
		padding: 8px 14px 0;
		background: var(--bg);
		flex-shrink: 0;
	}
	.sheet-tabs::before {
		content: '';
		display: block;
		position: absolute;
	}
	.sheet-tab {
		flex: 1;
		height: 32px;
		border-radius: 8px;
		border: 0;
		background: transparent;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
		color: var(--ink-muted);
		cursor: pointer;
	}
	.sheet-tab.is-active {
		background: var(--chip-bg);
		color: var(--ink);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.sheet-body {
		flex: 1;
		overflow-y: auto;
		padding: 12px 0 8px;
		-webkit-overflow-scrolling: touch;
	}

	.sheet-panel { display: flex; flex-direction: column; }

	.sheet-toc {
		list-style: none;
		margin: 0;
		padding: 4px 20px;
	}
	.sheet-toc__item {
		padding: 9px 0;
		border-bottom: 0.5px solid color-mix(in oklab, var(--rule) 60%, transparent);
		font-family: var(--font-sans);
	}
	.sheet-toc__item:last-child { border-bottom: 0; }
	.sheet-toc__item a {
		display: block;
		font-size: 14px;
		color: var(--ink);
		text-decoration: none;
	}
	.sheet-toc__item--level-3 a,
	.sheet-toc__item--level-4 a {
		padding-left: 18px;
		font-size: 13px;
		color: var(--ink-soft);
	}
	.sheet-toc__item--level-4 a { padding-left: 36px; }

	.sheet-cites { padding: 6px 20px 12px; }
	.sheet-cite {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px 0;
		border-bottom: 0.5px solid var(--rule);
		color: var(--ink);
		text-decoration: none;
	}
	.sheet-cite:last-of-type { border-bottom: 0; }
	.sheet-cite__tag {
		font-family: var(--font-sans);
		font-size: 9.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.sheet-cite__label {
		font-family: var(--font-sans);
		font-size: 13.5px;
		font-weight: 500;
	}
	.sheet-cite__title {
		font-family: var(--font-serif-body);
		font-style: italic;
		font-size: 13.5px;
		line-height: 1.4;
		color: var(--ink-soft);
	}
	.sheet-cite.is-active { background: var(--accent-soft); }

	.sheet-cites__sep {
		font-family: var(--font-sans);
		font-size: 10px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
		margin: 18px 0 8px;
	}
	.sheet-backlinks {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sheet-backlinks li {
		padding: 8px 0;
		border-bottom: 0.5px solid color-mix(in oklab, var(--rule) 60%, transparent);
	}
	.sheet-backlinks li:last-child { border-bottom: 0; }
	.sheet-backlinks a {
		font-family: var(--font-sans);
		font-size: 13px;
		color: var(--ink);
		text-decoration: none;
	}

	/* `.sheet-action` / `.sheet-action__*` rows ship as globals from
	   `src/routes/layout.css` so /new, /, and the viewer all pick them
	   up without depending on DocReader being on the page. */

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

	@media (max-width: 1024px) {
		.layout { grid-template-columns: minmax(0, 1fr); }
		.article-scroll { grid-column: 1; }
		.left-rail { display: none; }
		.doc-title { font-size: 40px; }
	}

	/* Phone — swap the top meta-row + byline block for a kicker row + a
	   one-line author strip, move tags to a bottom section, and stop
	   justifying prose (justified text on a ~320-480px column produces
	   rivers of whitespace that hurt readability). */
	@media (max-width: 1024px) {
		.meta-row,
		.doc-byline { display: none; }

		.kicker-row {
			display: flex;
			align-items: center;
			gap: 8px;
			font-family: var(--font-sans);
			font-size: 10.5px;
			letter-spacing: 0.09em;
			text-transform: uppercase;
			color: var(--ink-muted);
			margin: 4px 0 14px;
		}
		.kicker-lead {
			color: var(--ink);
			font-weight: 600;
			display: inline-flex;
			align-items: center;
			gap: 6px;
		}
		.kicker-dot { color: var(--accent); font-size: 10px; line-height: 1; }
		.kicker-sep { opacity: 0.5; }

		.doc-title {
			font-size: 32px;
			letter-spacing: -0.015em;
			line-height: 1.1;
			margin-bottom: 14px;
			font-variation-settings: 'opsz' 60;
		}

		.doc-deck {
			font-size: 17px;
			line-height: 1.5;
			margin-bottom: 22px;
		}

		.author-strip {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 12px 0;
			margin: 0 0 24px;
			border-top: 0.5px solid var(--rule);
			border-bottom: 0.5px solid var(--rule);
			font-family: var(--font-sans);
		}

		.author-names {
			flex: 1;
			min-width: 0;
			font-size: 13px;
			font-weight: 500;
			color: var(--ink);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}
		.author-time {
			font-size: 11.5px;
			color: var(--ink-muted);
			flex-shrink: 0;
		}

		/* Left-aligned + hyphens is the biggest readability win on narrow
		   columns — see `.kicker-row` rationale above. */
		:global(.prose.doc-body p) {
			text-align: left;
			hyphens: auto;
			-webkit-hyphens: auto;
		}
		:global(.prose.doc-body) { font-size: 17px; }
		:global(.prose.doc-body h2) { font-size: 24px; margin: 40px 0 14px; }
		:global(.prose.doc-body h3) { font-size: 19px; margin: 32px 0 12px; }

		.tag-cloud {
			display: block;
			margin-top: 44px;
			padding-top: 22px;
			border-top: 0.5px solid var(--rule);
		}
		.tag-cloud__label {
			font-family: var(--font-sans);
			font-size: 10px;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			color: var(--ink-muted);
			margin: 0 0 10px;
		}
		.tag-cloud__list {
			display: flex;
			flex-wrap: wrap;
			gap: 6px;
		}
		.tag-cloud__chip {
			font-family: var(--font-sans);
			font-size: 12px;
			color: var(--ink-soft);
			padding: 4px 9px;
			border-radius: 4px;
			background: var(--chip-bg);
			border: 0.5px solid var(--rule);
		}
		.tag-cloud__chip:hover {
			background: var(--accent-soft);
			color: var(--accent-ink);
			border-color: var(--accent);
		}
	}

	/* Phone: FAB replaces back-to-top; actions live in the sheet. */
	@media (max-width: 1024px) {
		.fab { display: inline-flex; }
		.scrim { display: block; }
		.sheet { display: flex; }
		.back-to-top { display: none; }
	}

	@media (max-width: 640px) {
		/* Leftover desktop-ish breakpoint — nothing to do here now that the
		   back-to-top is gone from mobile. Preserved as an anchor in case
		   phone-only tweaks need to slot in. */
	}
</style>
