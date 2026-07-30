<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages';
	import { docHref } from '$lib/nav';
	import { dur } from '$lib/motion';

	interface Hit {
		id: string;
		workspaceId: string;
		slug: string;
		title: string;
		mode: 'markdown' | 'typst';
		snippet: string;
	}

	let { open = $bindable(false), workspaceId }: { open?: boolean; workspaceId: string } = $props();

	let query = $state('');
	let scopeAll = $state(false);
	let hits = $state<Hit[]>([]);
	let cursor = $state(0);
	let loading = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let token = 0;

	$effect(() => {
		if (open) input?.focus();
	});

	async function run(q: string, all: boolean, mine: number) {
		const params = new URLSearchParams({ q });
		if (!all) params.set('ws', workspaceId);
		try {
			const res = await fetch(`/api/search?${params}`);
			const body = await res.json();
			if (mine !== token) return;
			hits = res.ok ? (body.hits ?? []) : [];
			cursor = 0;
		} catch {
			if (mine === token) hits = [];
		} finally {
			if (mine === token) loading = false;
		}
	}

	function schedule() {
		clearTimeout(timer);
		const q = query.trim();
		token++;
		if (q.length < 2) {
			hits = [];
			loading = false;
			return;
		}
		loading = true;
		const mine = token;
		timer = setTimeout(() => run(q, scopeAll, mine), 140);
	}

	function close() {
		open = false;
		query = '';
		hits = [];
		clearTimeout(timer);
		token++;
	}

	async function pick(hit: Hit) {
		close();
		await goto(docHref(hit.workspaceId, hit.slug));
	}

	function onKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			open = !open;
			return;
		}
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			cursor = hits.length === 0 ? 0 : (cursor + 1) % hits.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			cursor = hits.length === 0 ? 0 : (cursor - 1 + hits.length) % hits.length;
		} else if (event.key === 'Enter' && hits[cursor]) {
			event.preventDefault();
			pick(hits[cursor]);
		}
	}

	function segments(raw: string): { text: string; hit: boolean }[] {
		return raw
			.split(/(<mark>[\s\S]*?<\/mark>)/g)
			.filter(Boolean)
			.map((part) =>
				part.startsWith('<mark>')
					? { text: part.slice(6, -7), hit: true }
					: { text: part, hit: false }
			);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="scrim" transition:fade={{ duration: dur(140) }} onclick={close}></div>
	<div
		class="palette"
		role="dialog"
		aria-modal="true"
		aria-label={m.search_placeholder()}
		transition:scale={{ duration: dur(160), start: 0.97, easing: cubicOut }}
	>
		<div class="field">
			<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
				<circle cx="11" cy="11" r="7" />
				<path d="m20 20-3.5-3.5" />
			</svg>
			<input
				bind:this={input}
				bind:value={query}
				oninput={schedule}
				type="text"
				placeholder={m.search_placeholder()}
				autocomplete="off"
				spellcheck="false"
			/>
			<button
				type="button"
				class="scope"
				class:on={scopeAll}
				onclick={() => {
					scopeAll = !scopeAll;
					schedule();
				}}
			>
				{m.search_all_workspaces()}
			</button>
		</div>

		<div class="results">
			{#if !query.trim()}
				<p class="hint">{m.search_prompt()}</p>
			{:else if hits.length === 0}
				<p class="hint">{loading ? '…' : m.search_empty()}</p>
			{:else}
				{#each hits as hit, i (hit.id)}
					<button
						type="button"
						class="hit"
						class:active={i === cursor}
						onmouseenter={() => (cursor = i)}
						onclick={() => pick(hit)}
					>
						<span class="hit-title">{hit.title || m.doc_untitled()}</span>
						{#if hit.snippet}
							<span class="hit-snippet">
								{#each segments(hit.snippet) as part, j (j)}
									{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}
								{/each}
							</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgb(0 0 0 / 0.45);
	}

	.palette {
		position: fixed;
		z-index: 41;
		top: 12vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(640px, calc(100vw - 32px));
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
		color: var(--text-faint);
	}
	.field input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font-size: 15px;
		outline: none;
	}

	.scope {
		flex-shrink: 0;
		padding: 3px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: none;
		color: var(--text-faint);
		font-size: 11.5px;
		cursor: pointer;
	}
	.scope.on {
		border-color: transparent;
		background: var(--brand);
		color: #fff;
	}

	.results {
		max-height: min(52vh, 460px);
		overflow-y: auto;
		padding: 6px;
	}

	.hint {
		margin: 0;
		padding: 18px 10px;
		text-align: center;
		color: var(--text-faint);
		font-size: 13px;
	}

	.hit {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		text-align: start;
		cursor: pointer;
	}
	.hit.active {
		background: var(--surface-hover);
	}

	.hit-title {
		display: block;
		font-size: 13.5px;
		font-weight: 500;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hit-snippet {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		margin-top: 2px;
		font-size: 12.5px;
		color: var(--text-muted);
	}
</style>
