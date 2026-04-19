<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SearchResult } from '../routes/api/search/+server';

	let { theme = 'light' }: { theme?: 'light' | 'dark' } = $props();

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let open = $state(false);
	let activeIdx = $state(-1);
	let debounce: ReturnType<typeof setTimeout>;
	let inputEl: HTMLInputElement;
	let listEl = $state<HTMLUListElement | undefined>(undefined);

	async function search(q: string) {
		if (q.length < 2) {
			results = [];
			open = false;
			return;
		}
		loading = true;
		const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
		results = await res.json();
		loading = false;
		open = results.length > 0;
		activeIdx = -1;
	}

	function onInput() {
		clearTimeout(debounce);
		debounce = setTimeout(() => search(query), 200);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIdx = Math.min(activeIdx + 1, results.length - 1);
			scrollActive();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIdx = Math.max(activeIdx - 1, -1);
			scrollActive();
		} else if (e.key === 'Enter' && activeIdx >= 0) {
			e.preventDefault();
			navigate(results[activeIdx].slug);
		} else if (e.key === 'Escape') {
			close();
		}
	}

	function scrollActive() {
		if (!listEl) return;
		const item = listEl.children[activeIdx] as HTMLElement | undefined;
		item?.scrollIntoView({ block: 'nearest' });
	}

	function navigate(slug: string) {
		query = '';
		results = [];
		open = false;
		goto(`/${slug}`);
	}

	function close() {
		open = false;
		activeIdx = -1;
	}

	function onFocus() {
		if (results.length > 0) open = true;
	}

	function onBlur(e: FocusEvent) {
		// delay so click on result fires first
		setTimeout(() => {
			if (!listEl?.contains(document.activeElement)) close();
		}, 150);
	}

	// ⌘K / Ctrl+K global shortcut
	function onGlobalKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			inputEl?.focus();
			inputEl?.select();
		}
	}
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="search-wrap" class:dark={theme === 'dark'}>
	<div class="search-box" class:focused={open}>
		<svg class="search-icon" viewBox="0 0 20 20" fill="none">
			<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/>
			<path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
		</svg>
		<input
			bind:this={inputEl}
			bind:value={query}
			oninput={onInput}
			onkeydown={onKeydown}
			onfocus={onFocus}
			onblur={onBlur}
			type="search"
			placeholder="Buscar…"
			autocomplete="off"
			spellcheck="false"
			class="search-input"
			aria-label="Buscar documentos"
			aria-haspopup="listbox"
		/>
		{#if loading}
			<span class="spinner" aria-hidden="true"></span>
		{:else if query}
			<kbd class="shortcut-hint">esc</kbd>
		{:else}
			<kbd class="shortcut-hint">⌘K</kbd>
		{/if}
	</div>

	{#if open}
		<ul
			bind:this={listEl}
			class="results-dropdown"
			role="listbox"
		>
			{#each results as result, i}
				<li
					role="option"
					aria-selected={i === activeIdx}
					class="result-item"
					class:active={i === activeIdx}
					onmousedown={() => navigate(result.slug)}
					onmouseenter={() => (activeIdx = i)}
				>
					<div class="result-header">
						<span class="result-title">{result.title}</span>
						<span class="result-slug">/{result.slug}</span>
					</div>
					{#if result.matchIn === 'content'}
						<div class="result-excerpt">{@html result.excerpt}</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.search-wrap {
		position: relative;
		font-family: var(--font-sans);
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 0 12px;
		transition: border-color 0.15s, background 0.15s;
		min-width: 220px;
	}

	.search-box.focused {
		border-color: var(--accent);
		background: #fff;
	}

	.dark .search-box {
		background: #222;
		border-color: #333;
	}

	.dark .search-box.focused {
		border-color: #555;
	}

	.search-icon {
		width: 14px;
		height: 14px;
		color: var(--ink-muted);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		font-size: 14px;
		padding: 8px 0;
		color: var(--ink);
		min-width: 0;
		font-family: var(--font-sans);
	}

	.dark .search-input { color: #d4d4d4; }
	.search-input::placeholder { color: var(--ink-muted); }
	.search-input::-webkit-search-cancel-button { display: none; }

	.shortcut-hint {
		font-family: var(--font-sans);
		font-size: 11px;
		padding: 2px 6px;
		background: var(--kbd-bg);
		border: 1px solid var(--kbd-border);
		border-radius: 4px;
		color: var(--ink-soft);
		flex-shrink: 0;
		pointer-events: none;
		user-select: none;
	}

	.dark .shortcut-hint {
		background: #2a2a2a;
		border-color: #444;
		color: #666;
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

	.results-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		min-width: 340px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 10px;
		box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.2);
		list-style: none;
		margin: 0;
		padding: 6px;
		z-index: 100;
		max-height: 420px;
		overflow-y: auto;
	}

	.dark .results-dropdown {
		background: #1e1e1e;
		border-color: #333;
	}

	.result-item {
		padding: 8px 10px;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.08s;
	}

	.result-item.active,
	.result-item:hover {
		background: var(--accent-soft);
	}

	.dark .result-item.active,
	.dark .result-item:hover {
		background: #2a2a2a;
	}

	.result-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.result-title {
		font-size: 13.5px;
		font-weight: 500;
		color: var(--ink);
	}

	.result-item.active .result-title,
	.result-item:hover .result-title { color: var(--accent-ink); }

	.dark .result-title { color: #e0e0e0; }

	.result-slug {
		font-size: 11.5px;
		color: var(--ink-muted);
		font-family: var(--font-mono);
	}

	.result-excerpt {
		font-size: 12px;
		color: var(--ink-muted);
		margin-top: 3px;
		line-height: 1.5;
		overflow: hidden;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.dark .result-excerpt { color: #888; }

	:global(.result-excerpt mark) {
		background: color-mix(in oklab, var(--accent) 30%, transparent);
		color: inherit;
		border-radius: 2px;
		padding: 0 1px;
	}

	.dark :global(.result-excerpt mark) {
		background: #854d0e;
		color: #fef9c3;
	}

	@media (max-width: 640px) {
		.search-box { min-width: 0; }
		.results-dropdown {
			min-width: 0;
			max-height: 60vh;
		}
		.shortcut-hint { display: none; }
	}
</style>
