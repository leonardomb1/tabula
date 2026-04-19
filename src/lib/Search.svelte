<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { SearchResult } from '../routes/api/search/+server';
	import { openAiWith } from './aiDock.svelte';
	import { docPath } from './ids';

	type Heading = { id: string; text: string; level: number };

	let {
		wsId,
		wsName,
		pageHeadings = []
	}: {
		wsId: string;
		wsName?: string;
		pageHeadings?: Heading[];
	} = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let activeIdx = $state(0);
	let debounce: ReturnType<typeof setTimeout>;
	let inputEl = $state<HTMLInputElement | null>(null);
	let resultsEl = $state<HTMLDivElement | null>(null);

	// In-page heading matches — filtered client-side from the doc's TOC.
	const inPage = $derived.by<Heading[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) return pageHeadings.slice(0, 6);
		return pageHeadings.filter((h) => h.text.toLowerCase().includes(q)).slice(0, 8);
	});

	// Flat list drives keyboard navigation across both groups.
	type FlatItem =
		| { kind: 'doc'; result: SearchResult }
		| { kind: 'page'; heading: Heading };

	const flat = $derived.by<FlatItem[]>(() => {
		const list: FlatItem[] = [];
		for (const r of results) list.push({ kind: 'doc', result: r });
		for (const h of inPage) list.push({ kind: 'page', heading: h });
		return list;
	});

	async function runSearch(q: string) {
		if (q.trim().length < 2) {
			results = [];
			loading = false;
			activeIdx = 0;
			return;
		}
		loading = true;
		const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&ws=${encodeURIComponent(wsId)}`);
		results = res.ok ? await res.json() : [];
		loading = false;
		activeIdx = 0;
	}

	function onInput() {
		clearTimeout(debounce);
		debounce = setTimeout(() => runSearch(query), 180);
	}

	function openPalette() {
		open = true;
		setTimeout(() => inputEl?.focus(), 30);
	}

	function closePalette() {
		open = false;
		// Keep query between openings — feels nicer when re-opening after a quick close.
	}

	function pickDoc(r: SearchResult) {
		closePalette();
		goto(docPath(r.wsId, r.slug, r.title));
	}

	function pickHeading(h: Heading) {
		closePalette();
		const el = document.getElementById(h.id);
		if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		else location.hash = h.id;
	}

	function pickActive() {
		const item = flat[activeIdx];
		if (!item) return;
		if (item.kind === 'doc') pickDoc(item.result);
		else pickHeading(item.heading);
	}

	function handoffToAi() {
		const q = query.trim();
		if (!q) return;
		closePalette();
		openAiWith(q);
	}

	function onPaletteKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			closePalette();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIdx = Math.min(activeIdx + 1, Math.max(flat.length - 1, 0));
			scrollActive();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIdx = Math.max(activeIdx - 1, 0);
			scrollActive();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pickActive();
		} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
			// stopPropagation prevents AIDock's window-level ⌘J toggle from
			// firing in the same tick and closing the dock we just opened.
			e.preventDefault();
			e.stopPropagation();
			handoffToAi();
		}
	}

	function scrollActive() {
		if (!resultsEl) return;
		const node = resultsEl.querySelector<HTMLElement>(`[data-flat-idx="${activeIdx}"]`);
		node?.scrollIntoView({ block: 'nearest' });
	}

	function onBackdropMousedown(e: MouseEvent) {
		if (e.target === e.currentTarget) closePalette();
	}

	// ⌘K opens the palette from anywhere on the page.
	function onGlobalKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			if (open) closePalette();
			else openPalette();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onGlobalKey);
		return () => window.removeEventListener('keydown', onGlobalKey);
	});
</script>

<button
	type="button"
	class="search-trigger"
	onclick={openPalette}
	aria-haspopup="dialog"
	aria-expanded={open}
	aria-label="Buscar"
>
	<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
		<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.6" />
		<path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
	</svg>
	<span class="label">Buscar ou ir para…</span>
	<kbd>⌘K</kbd>
</button>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="palette-backdrop" onmousedown={onBackdropMousedown}>
		<div class="palette" role="dialog" aria-label="Buscar">
			<div class="palette-search">
				<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5" />
					<path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={onInput}
					onkeydown={onPaletteKey}
					type="search"
					placeholder={wsName ? `Buscar em ${wsName}, ir para…` : 'Buscar, ir para…'}
					autocomplete="off"
					spellcheck="false"
				/>
				{#if loading}
					<span class="spinner" aria-hidden="true"></span>
				{/if}
				<span class="esc">esc</span>
			</div>

			<div class="palette-results" bind:this={resultsEl}>
				{#if results.length > 0}
					<div class="palette-group">Documentos</div>
					{#each results as r, i}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="palette-item"
							class:is-selected={i === activeIdx}
							data-flat-idx={i}
							onmousedown={(e) => { e.preventDefault(); pickDoc(r); }}
							onmouseenter={() => (activeIdx = i)}
						>
							<span class="pi-kind">doc</span>
							<span class="pi-title">{r.title}</span>
							<span class="pi-sub">{r.slug}</span>
						</div>
					{/each}
				{/if}

				{#if inPage.length > 0}
					<div class="palette-group">Nesta página</div>
					{#each inPage as h, j}
						{@const flatIdx = results.length + j}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="palette-item"
							class:is-selected={flatIdx === activeIdx}
							data-flat-idx={flatIdx}
							onmousedown={(e) => { e.preventDefault(); pickHeading(h); }}
							onmouseenter={() => (activeIdx = flatIdx)}
						>
							<span class="pi-kind">§</span>
							<span class="pi-title">{h.text}</span>
							<span class="pi-sub">seção</span>
						</div>
					{/each}
				{/if}

				{#if !loading && query.trim().length >= 2 && results.length === 0 && inPage.length === 0}
					<div class="palette-empty">Nenhum resultado para <em>{query}</em>.</div>
				{:else if !query && inPage.length === 0 && results.length === 0}
					<div class="palette-empty">Comece a digitar para buscar no workspace.</div>
				{/if}
			</div>

			<div class="palette-foot">
				<span><kbd>↑↓</kbd> navegar</span>
				<span><kbd>⏎</kbd> abrir</span>
				<span class="spacer"></span>
				<button
					type="button"
					class="handoff"
					onmousedown={(e) => { e.preventDefault(); handoffToAi(); }}
					disabled={!query.trim()}
					title="Perguntar à assistente com esta consulta"
				>
					Perguntar à assistente <kbd>⌘J</kbd>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.search-trigger {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		height: 30px;
		padding: 0 10px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 999px;
		color: var(--ink-muted);
		font-size: 13px;
		font-family: var(--font-sans);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
		min-width: 0;
	}

	.search-trigger:hover {
		border-color: var(--accent);
		color: var(--ink);
		background: var(--bg);
	}

	.search-trigger svg {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
	}

	.search-trigger .label {
		letter-spacing: 0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.search-trigger kbd {
		font-family: var(--font-sans);
		font-size: 10.5px;
		padding: 1px 6px;
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		border-radius: 4px;
		color: var(--ink-soft);
		margin-left: auto;
		flex-shrink: 0;
	}

	.palette-backdrop {
		position: fixed;
		inset: 0;
		background: color-mix(in oklab, var(--ink) 22%, transparent);
		backdrop-filter: blur(3px);
		-webkit-backdrop-filter: blur(3px);
		z-index: 200;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 14vh;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.palette {
		width: min(620px, 92vw);
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 10px;
		box-shadow: 0 30px 80px -24px rgba(0, 0, 0, 0.4);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		max-height: 72vh;
		animation: palettePop 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.1);
	}

	@keyframes palettePop {
		from { transform: translateY(-8px) scale(0.985); opacity: 0; }
		to { transform: translateY(0) scale(1); opacity: 1; }
	}

	.palette-search {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--rule);
		color: var(--ink-muted);
	}

	.palette-search input {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		font-size: 16px;
		font-family: var(--font-sans);
		color: var(--ink);
		min-width: 0;
	}

	.palette-search input::placeholder { color: var(--ink-muted); }
	.palette-search input::-webkit-search-cancel-button { display: none; }

	.palette-search .esc {
		font-family: var(--font-mono);
		font-size: 10.5px;
		padding: 2px 6px;
		border: 1px solid var(--rule);
		border-radius: 3px;
		color: var(--ink-muted);
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 2px solid var(--rule);
		border-top-color: var(--ink-soft);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.palette-results {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 6px;
	}

	.palette-group {
		padding: 8px 12px 4px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		font-family: var(--font-sans);
	}

	.palette-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border-radius: 6px;
		cursor: pointer;
		font-family: var(--font-sans);
	}

	.palette-item.is-selected { background: var(--accent-soft); }

	.palette-item .pi-kind {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-muted);
		padding: 1px 5px;
		border: 1px solid var(--rule);
		border-radius: 3px;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.palette-item .pi-title {
		font-family: var(--font-serif-display);
		font-size: 14px;
		font-weight: 500;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}

	.palette-item.is-selected .pi-title { color: var(--accent-ink); }

	.palette-item .pi-sub {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-muted);
		margin-left: auto;
		flex-shrink: 0;
	}

	.palette-empty {
		padding: 24px 16px;
		text-align: center;
		font-family: var(--font-serif-body);
		font-style: italic;
		color: var(--ink-muted);
		font-size: 13.5px;
	}

	.palette-empty em {
		color: var(--ink);
		font-style: normal;
		font-weight: 500;
	}

	.palette-foot {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-top: 1px solid var(--rule);
		background: var(--bg-deep);
		font-family: var(--font-sans);
		font-size: 11px;
		color: var(--ink-muted);
	}

	.palette-foot .spacer { flex: 1; }

	.palette-foot kbd {
		font-family: var(--font-mono);
		font-size: 10.5px;
		padding: 1px 5px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 3px;
		color: var(--ink-soft);
		margin: 0 2px;
	}

	.handoff {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 24px;
		padding: 0 10px;
		border: 1px solid var(--rule);
		background: var(--surface);
		color: var(--ink-soft);
		border-radius: 999px;
		font-family: var(--font-sans);
		font-size: 11.5px;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
	}

	.handoff:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent-ink);
		background: var(--accent-soft);
	}

	.handoff:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.search-trigger .label {
			font-size: 12px;
		}
		.search-trigger kbd { display: none; }
		.palette-backdrop { padding-top: 8vh; }
		.palette-item .pi-sub { display: none; }
	}
</style>
