<script lang="ts">
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages';
	import { clickOutside } from '$lib/clickOutside';
	import { dur } from '$lib/motion';
	import Crown from './Crown.svelte';
	import { adminHref } from '$lib/nav';
	
	let {
		user,
		workspaces = [],
		currentId = '',
		onOpenSettings,
		onOpenWorkspaces
	}: {
		user: {
			username: string;
			displayName?: string;
			isPlatformAdmin: boolean;
			crown?: 'gold' | 'silver' | null;
			canAdmin?: boolean;
		};
		workspaces?: { id: string; name: string }[];
		currentId?: string;
		onOpenSettings: () => void;
		onOpenWorkspaces: () => void;
	} = $props();

	let open = $state(false);

	const currentName = $derived(workspaces.find((w) => w.id === currentId)?.name ?? '');

	const name = $derived(user.displayName || user.username);
	const initials = $derived(
		name
			.split(/[\s,]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);

	function openSettings() {
		open = false;
		onOpenSettings();
	}

	function openWorkspaces() {
		open = false;
		onOpenWorkspaces();
	}

	async function signOut() {
		open = false;
		await fetch('/auth/logout', { method: 'POST' });
		location.href = '/login';
	}
</script>

<div class="prefs" use:clickOutside={() => (open = false)}>
	{#if open}
		<div class="menu" transition:scale={{ duration: dur(130), start: 0.96, easing: cubicOut }}>
			<p class="who">{user.username}</p>

			{#if workspaces.length > 1}
				<button type="button" class="item" onclick={openWorkspaces}>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<rect x="3" y="4" width="7" height="7" rx="1.5" />
						<rect x="14" y="4" width="7" height="7" rx="1.5" />
						<rect x="3" y="14" width="7" height="6" rx="1.5" />
						<rect x="14" y="14" width="7" height="6" rx="1.5" />
					</svg>
					<span>{m.workspaces()}</span>
					<span class="trailing">{currentName}</span>
				</button>
				<hr />
			{/if}

			{#if user.canAdmin}
				<a class="item" href={adminHref()} onclick={() => (open = false)}>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M12 2.8l7.5 3.1v5.4c0 4.3-3 8.1-7.5 9.9-4.5-1.8-7.5-5.6-7.5-9.9V5.9z" />
						<path d="M9.4 12.1l1.9 1.9 3.4-3.8" />
					</svg>
					<span>{m.admin_menu()}</span>
				</a>
			{/if}

			<button type="button" class="item" onclick={openSettings}>
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="3.2" />
					<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
				</svg>
				<span>{m.settings()}</span>
			</button>

			<hr />

			<button type="button" class="item" onclick={signOut}>
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M15 17l5-5-5-5M20 12H9M12 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7" />
				</svg>
				<span>{m.signout()}</span>
			</button>
		</div>
	{/if}

	<button
		type="button"
		class="trigger"
		aria-label={m.menu_account()}
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<span class="crest">
			<span class="avatar">{initials}</span>
			{#if user.crown}
				<Crown variant={user.crown} size={16} />
			{/if}
		</span>
		<span class="name">{name}</span>
	</button>
</div>

<style>
	.prefs {
		position: relative;
		border-top: 1px solid var(--border);
		padding: 8px;
	}

	.trigger {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 6px 8px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		cursor: pointer;
		text-align: start;
		transition: background-color 120ms ease;
	}
	.trigger:hover {
		background: var(--surface-hover);
	}

	.crest {
		position: relative;
		flex: none;
		display: block;
	}
	.crest :global(.crown) {
		position: absolute;
		top: -9px;
		left: 50%;
		transform: translateX(-50%);
	}

	.avatar {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--brand);
		color: #fff;
		font-size: 10.5px;
		font-weight: 600;
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		color: var(--text-muted);
	}

	.menu {
		position: absolute;
		bottom: calc(100% - 2px);
		inset-inline: 8px;
		transform-origin: bottom center;
		padding: 5px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.who {
		margin: 0;
		padding: 6px 9px 8px;
		font-size: 12px;
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 9px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		font-size: 13px;
		text-align: start;
		text-decoration: none;
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item svg {
		flex-shrink: 0;
		color: var(--text-faint);
	}
	.item:hover svg {
		color: var(--text-muted);
	}
	.item span:not(.trailing) {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.trailing {
		flex-shrink: 0;
		font-size: 11.5px;
		color: var(--text-faint);
	}

	hr {
		margin: 5px 4px;
		border: 0;
		border-top: 1px solid var(--border);
	}
</style>
