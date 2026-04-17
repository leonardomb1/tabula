<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';

	let { theme = 'light' }: { theme?: 'light' | 'dark' } = $props();

	const user = $derived($page.data.user as { username: string; displayName: string } | null);
	const currentWs = $derived($page.data.currentWs as { id: string; name: string } | null);
	let open = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);

	function initials(name: string): string {
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return '?';
		if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

	function onDocClick(e: MouseEvent) {
		if (!open) return;
		if (rootEl && !rootEl.contains(e.target as Node)) open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}

	function onLogout() {
		return async () => {
			window.location.href = '/login';
		};
	}
</script>

<svelte:document onclick={onDocClick} onkeydown={onKey} />

{#if user}
	<div class="user-menu" class:dark={theme === 'dark'} bind:this={rootEl}>
		<button
			type="button"
			class="trigger"
			onclick={() => (open = !open)}
			aria-haspopup="menu"
			aria-expanded={open}
			aria-label={`Menu de ${user.displayName}`}
		>
			<span class="avatar" aria-hidden="true">{initials(user.displayName)}</span>
			<span class="name-text">{user.displayName}</span>
		</button>

		{#if open}
			<div class="dropdown" role="menu">
				<div class="dropdown-header">
					<span class="dropdown-avatar" aria-hidden="true">{initials(user.displayName)}</span>
					<div class="dropdown-id">
						<span class="dropdown-name">{user.displayName}</span>
						<span class="dropdown-user">@{user.username}</span>
					</div>
				</div>
				{#if currentWs}
					<div class="dropdown-ws" aria-label="Workspace atual">
						<span class="dropdown-ws-label">workspace</span>
						<span class="dropdown-ws-name">{currentWs.name}</span>
					</div>
				{/if}
				<form method="POST" action="/logout" use:enhance={onLogout}>
					<button type="submit" class="logout" role="menuitem">Sair</button>
				</form>
			</div>
		{/if}
	</div>
{/if}

<style>
	.user-menu {
		position: relative;
		font-family: ui-sans-serif, system-ui, sans-serif;
		flex-shrink: 0;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: 1px solid transparent;
		padding: 0.25rem 0.65rem 0.25rem 0.25rem;
		border-radius: 999px;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}
	.trigger:hover { background: #f5f3ee; border-color: #e0ddd5; }
	.trigger[aria-expanded='true'] { background: #f5f3ee; border-color: #e0ddd5; }

	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: #1a1a1a;
		color: #fff;
		font-weight: 600;
		font-size: 0.76rem;
		letter-spacing: 0.02em;
		flex-shrink: 0;
	}

	.name-text {
		font-size: 0.82rem;
		color: #444;
		white-space: nowrap;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Dark-theme variant for the editor header */
	.dark .trigger:hover { background: #222; border-color: #333; }
	.dark .trigger[aria-expanded='true'] { background: #222; border-color: #333; }
	.dark .name-text { color: #aaa; }

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		background: #fff;
		border: 1px solid #e0ddd5;
		border-radius: 10px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
		padding: 0.5rem;
		min-width: 14rem;
		z-index: 200;
	}
	.dark .dropdown { background: #1e1e1e; border-color: #333; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); }

	.dropdown-header {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.45rem 0.4rem 0.7rem;
		border-bottom: 1px solid #e8e5df;
		margin-bottom: 0.4rem;
	}
	.dark .dropdown-header { border-bottom-color: #2a2a2a; }

	.dropdown-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: #1a1a1a;
		color: #fff;
		font-weight: 600;
		font-size: 0.95rem;
		flex-shrink: 0;
	}
	.dropdown-id { display: flex; flex-direction: column; min-width: 0; }
	.dropdown-name { font-size: 0.88rem; font-weight: 600; color: #1a1a1a; overflow: hidden; text-overflow: ellipsis; }
	.dropdown-user { font-size: 0.74rem; color: #999; font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; }
	.dark .dropdown-name { color: #e0e0e0; }
	.dark .dropdown-user { color: #666; }

	.dropdown-ws {
		display: flex;
		flex-direction: column;
		padding: 0.4rem 0.55rem 0.55rem;
		margin: 0 -0.5rem 0.4rem;
		border-bottom: 1px solid #e8e5df;
		background: #faf9f5;
	}
	.dropdown-ws-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #999;
	}
	.dropdown-ws-name { font-size: 0.85rem; color: #1a1a1a; font-weight: 500; margin-top: 0.1rem; }
	.dark .dropdown-ws { background: #161616; border-bottom-color: #2a2a2a; }
	.dark .dropdown-ws-label { color: #666; }
	.dark .dropdown-ws-name { color: #d0d0d0; }

	.dropdown form { margin: 0; }
	.logout {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		padding: 0.55rem 0.5rem;
		border-radius: 6px;
		font-size: 0.85rem;
		color: #444;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
		font-family: inherit;
	}
	.logout:hover { background: #f5f3ee; color: var(--brand); }
	.dark .logout { color: #aaa; }
	.dark .logout:hover { background: #2a2a2a; color: var(--brand); }

	@media (max-width: 640px) {
		.name-text { display: none; }
		.trigger { padding: 0; border: none; background: none; }
		.trigger:hover, .trigger[aria-expanded='true'] { background: none; border: none; }
		.avatar { width: 32px; height: 32px; font-size: 0.78rem; }
		.dropdown { min-width: 12rem; }
	}
</style>
