<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { closeWorkspaceModal, workspaceModal } from './workspaceModal.svelte';

	type Workspace = { id: string; name: string; kind: 'team' | 'personal' };

	const workspaces = $derived(($page.data.workspaces ?? []) as Workspace[]);
	const current = $derived($page.data.currentWs as Workspace | null);
	const open = $derived(workspaceModal.open);

	let filter = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);

	const filtered = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return workspaces;
		return workspaces.filter((w) => w.name.toLowerCase().includes(q));
	});

	// Derive a consistent hue from the workspace id so each badge gets a
	// recognizable color. FNV-1a keeps the distribution even across names.
	function hueFor(id: string): number {
		let h = 0x811c9dc5;
		for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
		return (h >>> 0) % 360;
	}

	function initial(name: string): string {
		return (name.trim()[0] ?? '?').toUpperCase();
	}

	async function pick(ws: Workspace) {
		closeWorkspaceModal();
		if (current && ws.id === current.id) return;
		// Cookie + localStorage mirror the existing switch mechanic so SSR
		// and other tabs stay in sync.
		if (typeof localStorage !== 'undefined') localStorage.setItem('docs_ws', ws.id);
		document.cookie = `docs_ws=${encodeURIComponent(ws.id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
		await goto($page.url.pathname + $page.url.search, { invalidateAll: true });
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			closeWorkspaceModal();
		}
	}

	// Focus the filter input and reset state when the modal opens.
	$effect(() => {
		if (open) {
			filter = '';
			setTimeout(() => inputEl?.focus(), 60);
		}
	});

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeWorkspaceModal();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="backdrop"
		onclick={onBackdropClick}
		onkeydown={onKeydown}
		role="presentation"
	>
		<div class="modal" role="dialog" aria-modal="true" aria-label="Trocar workspace">
			<div class="modal-head">
				<p class="eyebrow">Workspaces</p>
				<h2 class="title">Trocar</h2>
			</div>

			<div class="filter">
				<svg class="icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5" />
					<path d="M13 13l3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={filter}
					type="search"
					placeholder="Filtrar workspaces…"
					autocomplete="off"
					spellcheck="false"
				/>
				<span class="kbd">esc</span>
			</div>

			<ul class="list">
				{#each filtered as ws}
					{@const isCurrent = current?.id === ws.id}
					<li>
						<button
							type="button"
							class="item"
							class:is-current={isCurrent}
							onclick={() => pick(ws)}
						>
							<span
								class="badge"
								style="background: oklch(0.55 0.14 {hueFor(ws.id)});"
								aria-hidden="true"
							>{initial(ws.name)}</span>
							<div class="main">
								<p class="name">{ws.name}</p>
								<p class="meta">{ws.kind === 'personal' ? 'pessoal' : 'time'}</p>
							</div>
							<svg
								class="check"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								aria-hidden="true"
							>
								<path d="M5 13l4 4L19 7" />
							</svg>
						</button>
					</li>
				{/each}
				{#if filtered.length === 0}
					<li class="empty">Nenhum workspace corresponde a <em>{filter}</em>.</li>
				{/if}
			</ul>

		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 120;
		background: rgba(20, 20, 22, 0.35);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 14vh 20px 40px;
		animation: fadeIn 0.18s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		width: min(480px, 100%);
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 12px;
		box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.35);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		font-family: var(--font-sans);
	}

	.modal-head {
		padding: 18px 18px 12px;
	}

	.eyebrow {
		margin: 0 0 4px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.title {
		margin: 0;
		font-family: var(--font-serif-display);
		font-size: 24px;
		font-weight: 500;
		letter-spacing: -0.015em;
		color: var(--ink);
	}

	.filter {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		background: var(--bg);
	}

	.filter .icon {
		width: 14px;
		height: 14px;
		color: var(--ink-muted);
		flex-shrink: 0;
	}

	.filter input {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		font-size: 13.5px;
		color: var(--ink);
		font-family: var(--font-sans);
	}

	.filter input::placeholder { color: var(--ink-muted); }

	.filter input::-webkit-search-cancel-button { display: none; }

	.filter .kbd {
		font-family: var(--font-sans);
		font-size: 10.5px;
		color: var(--ink-muted);
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		padding: 2px 6px;
		border-radius: 3px;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 8px;
		max-height: 50vh;
		overflow-y: auto;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 14px;
		width: 100%;
		padding: 10px 12px;
		border: 0;
		background: transparent;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
	}

	.item:hover { background: var(--bg-deep); }

	.item.is-current {
		background: var(--accent-soft);
	}

	.item.is-current .name { color: var(--accent-ink); }
	.item.is-current .check { opacity: 1; }

	.badge {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		display: grid;
		place-items: center;
		color: #fff;
		font-family: var(--font-serif-display);
		font-size: 16px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.main { flex: 1; min-width: 0; }

	.name {
		font-family: var(--font-serif-display);
		font-size: 15px;
		font-weight: 500;
		color: var(--ink);
		margin: 0 0 2px;
	}

	.meta {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--ink-muted);
		margin: 0;
	}

	.check {
		width: 16px;
		height: 16px;
		color: var(--accent);
		opacity: 0;
		flex-shrink: 0;
	}

	.empty {
		padding: 24px 12px;
		text-align: center;
		font-family: var(--font-serif-body);
		color: var(--ink-muted);
		font-size: 13px;
		font-style: italic;
	}

	.empty em { color: var(--ink); font-style: normal; }
</style>
