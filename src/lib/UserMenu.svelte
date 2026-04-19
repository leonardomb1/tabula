<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { cubicOut } from 'svelte/easing';

	/**
	 * Custom Svelte transition for the dropdown: fades in while sliding down
	 * a few pixels and scaling up from 0.96. The transform origin is anchored
	 * at the top-right so the scale feels like it's popping out of the trigger
	 * avatar rather than inflating from the center.
	 */
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

	const user = $derived($page.data.user as { username: string; displayName: string } | null);
	const currentWs = $derived($page.data.currentWs as { id: string; name: string } | null);
	let open = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);

	// Theme toggle — persists to localStorage under 'tabula-theme'. 'auto' is
	// stored by absence so the FOUC-prevention script in app.html doesn't
	// need a third branch. Initialized on mount so SSR doesn't diverge.
	type ThemeChoice = 'light' | 'dark' | 'auto';
	let theme = $state<ThemeChoice>('auto');

	onMount(() => {
		try {
			const stored = localStorage.getItem('tabula-theme');
			theme = stored === 'light' || stored === 'dark' ? stored : 'auto';
		} catch {
			/* ignore storage-restricted contexts */
		}
	});

	function setTheme(choice: ThemeChoice) {
		theme = choice;
		try {
			if (choice === 'auto') {
				localStorage.removeItem('tabula-theme');
				delete document.documentElement.dataset.theme;
			} else {
				localStorage.setItem('tabula-theme', choice);
				document.documentElement.dataset.theme = choice;
			}
		} catch {
			/* ignore */
		}
	}

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
	<div class="user-menu" bind:this={rootEl}>
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
			<div class="dropdown" role="menu" transition:popIn>
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

				<div class="theme-row" role="radiogroup" aria-label="Tema">
					<span class="theme-label">Tema</span>
					<div class="theme-seg">
						<button
							type="button"
							role="radio"
							aria-checked={theme === 'light'}
							class:is-active={theme === 'light'}
							onclick={() => setTheme('light')}
						>Papel</button>
						<button
							type="button"
							role="radio"
							aria-checked={theme === 'dark'}
							class:is-active={theme === 'dark'}
							onclick={() => setTheme('dark')}
						>Tinta</button>
						<button
							type="button"
							role="radio"
							aria-checked={theme === 'auto'}
							class:is-active={theme === 'auto'}
							onclick={() => setTheme('auto')}
						>Auto</button>
					</div>
				</div>

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
		font-family: var(--font-sans);
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
		transition: background 0.15s, border-color 0.15s, transform 0.12s;
	}

	.trigger:hover,
	.trigger[aria-expanded='true'] {
		background: var(--surface);
		border-color: var(--rule);
	}

	.trigger:active { transform: scale(0.97); }

	/* Avatar pulses once when the menu opens so the source of the dropdown
	   is unmistakable — tiny cue, matches the workspace pill's pop. */
	.trigger[aria-expanded='true'] .avatar { animation: avatarPulse 0.36s cubic-bezier(0.2, 0.9, 0.3, 1.1); }

	@keyframes avatarPulse {
		0% { transform: scale(1); }
		45% { transform: scale(1.15); }
		100% { transform: scale(1); }
	}

	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
		font-size: 0.76rem;
		letter-spacing: 0.02em;
		flex-shrink: 0;
	}

	.name-text {
		font-size: 0.82rem;
		color: var(--ink-soft);
		white-space: nowrap;
		max-width: 12rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 10px;
		box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.2);
		padding: 0.5rem;
		min-width: 15rem;
		z-index: 200;
	}

	.dropdown-header {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.45rem 0.4rem 0.7rem;
		border-bottom: 1px solid var(--rule-soft);
		margin-bottom: 0.4rem;
	}

	.dropdown-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--bg);
		font-weight: 600;
		font-size: 0.95rem;
		flex-shrink: 0;
	}

	.dropdown-id { display: flex; flex-direction: column; min-width: 0; }

	.dropdown-name {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dropdown-user {
		font-size: 0.74rem;
		color: var(--ink-muted);
		font-family: var(--font-mono);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.dropdown-ws {
		display: flex;
		flex-direction: column;
		padding: 0.4rem 0.55rem 0.55rem;
		margin: 0 -0.5rem 0.4rem;
		border-bottom: 1px solid var(--rule-soft);
		background: var(--bg-deep);
	}

	.dropdown-ws-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.dropdown-ws-name {
		font-size: 0.85rem;
		color: var(--ink);
		font-weight: 500;
		margin-top: 0.1rem;
	}

	/* Theme picker — segmented control. */
	.theme-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.3rem 0.4rem 0.55rem;
		margin-bottom: 0.3rem;
		border-bottom: 1px solid var(--rule-soft);
	}

	.theme-label {
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.theme-seg {
		display: flex;
		gap: 2px;
		background: var(--bg-deep);
		padding: 2px;
		border-radius: 5px;
	}

	.theme-seg button {
		flex: 1;
		height: 26px;
		border: 0;
		background: transparent;
		color: var(--ink-soft);
		font-size: 11.5px;
		border-radius: 3px;
		font-family: var(--font-sans);
	}

	.theme-seg button:hover { color: var(--ink); }

	.theme-seg button.is-active {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		font-weight: 500;
	}

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
		color: var(--ink-soft);
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
		font-family: inherit;
	}

	.logout:hover { background: var(--bg-deep); color: var(--accent); }

	@media (max-width: 640px) {
		.name-text { display: none; }
		.trigger { padding: 0; border: none; background: none; }
		.trigger:hover, .trigger[aria-expanded='true'] { background: none; border: none; }
		.avatar { width: 32px; height: 32px; font-size: 0.78rem; }
		.dropdown { min-width: 13rem; }
	}
</style>
