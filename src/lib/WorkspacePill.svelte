<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';

	type Workspace = { id: string; name: string; kind: 'team' | 'personal' };

	let { workspaces, current }: { workspaces: Workspace[]; current: Workspace } = $props();

	let open = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);

	function onDocClick(e: MouseEvent) {
		if (!open) return;
		if (rootEl && !rootEl.contains(e.target as Node)) open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	async function pick(ws: Workspace) {
		open = false;
		if (ws.id === current.id) return;
		// Persist for SSR (cookie) and client (localStorage). Cookie set via the
		// next page navigation; localStorage write is immediate so other tabs see it.
		if (typeof localStorage !== 'undefined') localStorage.setItem('docs_ws', ws.id);
		document.cookie = `docs_ws=${encodeURIComponent(ws.id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
		// Reload the current route so the server picks up the new cookie.
		await goto($page.url.pathname + $page.url.search, { invalidateAll: true });
	}

	function initial(name: string): string {
		return (name.trim()[0] ?? '?').toUpperCase();
	}
</script>

<svelte:document onclick={onDocClick} onkeydown={onKey} />

<div class="ws-pill" bind:this={rootEl}>
	<button
		type="button"
		class="trigger"
		onclick={() => (open = !open)}
		aria-haspopup="menu"
		aria-expanded={open}
		aria-label={`Workspace: ${current.name}`}
	>
		<span class="badge" aria-hidden="true">{initial(current.name)}</span>
		<span class="name">{current.name}</span>
		<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
			<path d="M6 9l6 6 6-6"/>
		</svg>
	</button>

	{#if open}
		<div class="dropdown" role="menu">
			{#each workspaces as ws}
				<button
					type="button"
					class="item"
					class:active={ws.id === current.id}
					role="menuitem"
					onclick={() => pick(ws)}
				>
					<span class="badge" aria-hidden="true">{initial(ws.name)}</span>
					<span class="item-name">{ws.name}</span>
					{#if ws.id === current.id}
						<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
							<path d="M5 13l4 4L19 7"/>
						</svg>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.ws-pill {
		position: relative;
		font-family: ui-sans-serif, system-ui, sans-serif;
		flex-shrink: 0;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: #f5f3ee;
		border: 1px solid #e0ddd5;
		padding: 0.3rem 0.55rem 0.3rem 0.3rem;
		border-radius: 999px;
		cursor: pointer;
		font-size: 0.82rem;
		color: #1a1a1a;
		transition: background 0.15s, border-color 0.15s;
	}
	.trigger:hover { background: #ebe8e0; }
	.trigger[aria-expanded='true'] { background: #ebe8e0; border-color: #b8b3a3; }

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 6px;
		background: var(--brand);
		color: #fff;
		font-weight: 700;
		font-size: 0.72rem;
		flex-shrink: 0;
	}

	.name { font-weight: 500; max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.chev { width: 12px; height: 12px; color: #888; flex-shrink: 0; }

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		min-width: 14rem;
		background: #fff;
		border: 1px solid #e0ddd5;
		border-radius: 10px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
		padding: 0.35rem;
		z-index: 200;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0.5rem 0.55rem;
		border-radius: 6px;
		font-size: 0.85rem;
		color: #1a1a1a;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		transition: background 0.1s;
	}
	.item:hover { background: #f5f3ee; }
	.item.active { background: #f5f3ee; font-weight: 600; }

	.item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.check { width: 14px; height: 14px; color: var(--brand); flex-shrink: 0; }

	@media (max-width: 640px) {
		.name { display: none; }
		.trigger { padding: 0.25rem; gap: 0.3rem; border-radius: 999px; }
	}
</style>
