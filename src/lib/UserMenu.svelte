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
			// Mirror to a cookie so the server can render the correct
			// assets (theme-aware brand logo) without a client-side swap.
			// 1 year; lax + path=/ so it's sent on every in-app navigation.
			if (choice === 'auto') {
				document.cookie = 'tabula-theme=; path=/; max-age=0; samesite=lax';
			} else {
				document.cookie = `tabula-theme=${choice}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
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
					<div class="section">
						<p class="section-eyebrow">Workspace atual</p>
						<p class="ws-name">{currentWs.name}</p>
					</div>
				{/if}

				<div class="section" role="radiogroup" aria-label="Tema">
					<p class="section-eyebrow">Tema</p>
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

				<a href="/settings" class="row-link" role="menuitem" onclick={() => (open = false)}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/>
						<path d="M13 8a5 5 0 0 0-.25-1.6l1.3-1-1.5-2.6-1.55.58A5 5 0 0 0 9.6 2.65L9.4 1h-2.8l-.2 1.65A5 5 0 0 0 4 3.38l-1.55-.58-1.5 2.6 1.3 1A5 5 0 0 0 2 8c0 .56.09 1.1.25 1.6l-1.3 1 1.5 2.6 1.55-.58A5 5 0 0 0 6.4 13.35L6.6 15h2.8l.2-1.65A5 5 0 0 0 12 12.62l1.55.58 1.5-2.6-1.3-1A5 5 0 0 0 14 8" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
					</svg>
					<span>Configurações</span>
					<svg class="chev" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>

				<form method="POST" action="/logout" use:enhance={onLogout}>
					<button type="submit" class="row-logout" role="menuitem">
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M10 11l3-3-3-3M13 8H6M8 2H3v12h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						<span>Sair</span>
					</button>
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

	/* Dropdown — shape, tokens, and motion now match WorkspaceModal so
	   the two feel like siblings: same 12px radii, same surface layering,
	   same eyebrow/serif typography vocabulary. Kept as a dropdown (not
	   a centered modal) because the actions here are all one-tap and a
	   centered modal would be heavy for them. */
	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		width: 280px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 12px;
		box-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.35);
		overflow: hidden;
		z-index: 200;
	}

	.dropdown-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 16px 14px;
		border-bottom: 1px solid var(--rule);
		background: var(--bg);
	}

	.dropdown-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		background: var(--ink);
		color: var(--bg);
		font-family: var(--font-serif-display);
		font-size: 16px;
		font-weight: 600;
		flex-shrink: 0;
	}

	.dropdown-id { display: flex; flex-direction: column; min-width: 0; }

	.dropdown-name {
		font-family: var(--font-serif-display);
		font-size: 16px;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-user {
		font-size: 11.5px;
		color: var(--ink-muted);
		font-family: var(--font-mono);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}

	/* Generic section — each block has a small uppercase eyebrow and
	   soft bottom rule, matching the modal head vocabulary. */
	.section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px 14px;
		border-bottom: 1px solid var(--rule-soft);
	}

	.section-eyebrow {
		margin: 0;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.ws-name {
		margin: 0;
		font-family: var(--font-serif-display);
		font-size: 14.5px;
		font-weight: 500;
		color: var(--ink);
	}

	.theme-seg {
		display: flex;
		gap: 2px;
		background: var(--bg-deep);
		padding: 2px;
		border-radius: 5px;
		border: 1px solid var(--rule);
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
		cursor: pointer;
	}

	.theme-seg button:hover { color: var(--ink); }

	.theme-seg button.is-active {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
		font-weight: 500;
	}

	/* Row links (Configurações, Sair) share a compact horizontal list
	   pattern with an icon on the left. */
	.row-link, .row-logout {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 16px;
		background: transparent;
		border: 0;
		color: var(--ink-soft);
		font-size: 13px;
		font-family: var(--font-sans);
		cursor: pointer;
		text-align: left;
		transition: background 0.12s, color 0.12s;
	}

	.row-link span, .row-logout span { flex: 1; }

	.row-link:hover, .row-logout:hover {
		background: var(--bg-deep);
		color: var(--ink);
	}

	.row-link .chev { color: var(--ink-muted); }
	.row-link:hover .chev { color: var(--ink); }

	.dropdown form { margin: 0; border-top: 1px solid var(--rule-soft); }

	.row-logout:hover { color: oklch(0.55 0.18 25); }
	:global([data-theme='dark']) .row-logout:hover { color: oklch(0.78 0.16 25); }

	@media (max-width: 640px) {
		.name-text { display: none; }
		.trigger { padding: 0; border: none; background: none; }
		.trigger:hover, .trigger[aria-expanded='true'] { background: none; border: none; }
		.avatar { width: 32px; height: 32px; font-size: 0.78rem; }
		.dropdown { width: calc(100vw - 24px); max-width: 320px; }
	}
</style>
