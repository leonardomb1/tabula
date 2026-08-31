<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { connectionsHref, docHref, templatesHref, toggleTag, workspaceHref } from '$lib/nav';
	import PrefsMenu from './PrefsMenu.svelte';
	import { PRODUCT_NAME, type Branding } from '$lib/branding';
	import type { TagCount } from '$lib/docs';

	interface WorkspaceRef {
		id: string;
		name: string;
		role: string | null;
	}
	interface RecentDoc {
		id: string;
		slug: string;
		title: string;
	}

	let {
		workspaces,
		current,
		recent,
		tagCounts,
		total,
		activeTags,
		user,
		canWrite = false,
		onOpenSearch,
		onOpenSettings,
		onOpenWorkspaces,
		ontoggle
	}: {
		workspaces: WorkspaceRef[];
		current: WorkspaceRef;
		recent: RecentDoc[];
		tagCounts: TagCount[];
		total: number;
		activeTags: string[];
		user: { username: string; displayName?: string; isPlatformAdmin: boolean };
		canWrite?: boolean;
		onOpenSearch: () => void;
		onOpenSettings: () => void;
		onOpenWorkspaces: () => void;
		ontoggle?: () => void;
	} = $props();

	let modKey = $state('Ctrl');
	let logoFailed = $state(false);

	onMount(() => {
		if (/mac/i.test(navigator.platform)) modKey = '⌘';
	});

	const branding = $derived(page.data.branding as Branding | undefined);
	const activePath = $derived(page.url.pathname);
</script>

<aside class="rail">
	<div class="rail-top">
		<div class="rail-head">
			<a
				class="brand"
				class:no-neg={!branding?.logoNegativeUrl}
				href={workspaceHref(current.id)}
				aria-label={branding?.name ?? PRODUCT_NAME}
			>
				{#if branding?.logoUrl && !logoFailed}
					<img
						class="pos"
						src={branding.logoUrl}
						alt={branding.name}
						onerror={() => (logoFailed = true)}
					/>
					{#if branding.logoNegativeUrl}
						<img class="neg" src={branding.logoNegativeUrl} alt="" aria-hidden="true" />
					{/if}
				{:else}
					<span class="wordmark">{branding?.name ?? PRODUCT_NAME}</span>
				{/if}
			</a>
			{#if ontoggle}
				<button
					type="button"
					class="rail-hide"
					aria-label={m.sidebar_hide()}
					title={m.sidebar_hide()}
					onclick={ontoggle}
				>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M3 5h18v14H3zM9 5v14M17 10l-2 2 2 2" />
					</svg>
				</button>
			{/if}
		</div>

		<button type="button" class="search" onclick={onOpenSearch}>
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
				<circle cx="11" cy="11" r="7" />
				<path d="m20 20-3.5-3.5" />
			</svg>
			<span>{m.search_placeholder()}</span>
			<kbd>{modKey}K</kbd>
		</button>
	</div>

	<nav class="rail-scroll">
		<a
			class="item"
			class:active={activePath === workspaceHref(current.id) && activeTags.length === 0}
			href={workspaceHref(current.id)}
		>
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M4 5h16M4 12h16M4 19h10" />
			</svg>
			<span class="label">{m.nav_all_docs()}</span>
			<span class="count">{total}</span>
		</a>

		{#if canWrite}
			<a class="item" class:active={activePath === templatesHref(current.id)} href={templatesHref(current.id)}>
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<path d="M3 9h18M8 20V9" />
				</svg>
				<span class="label">{m.templates()}</span>
			</a>
		{/if}

		<a class="item" class:active={activePath === connectionsHref(current.id)} href={connectionsHref(current.id)}>
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="18" cy="5" r="3" />
				<circle cx="6" cy="12" r="3" />
				<circle cx="18" cy="19" r="3" />
				<path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
			</svg>
			<span class="label">{m.nav_connections()}</span>
		</a>


		{#if recent.length > 0}
			<p class="head">{m.sidebar_recent()}</p>
			{#each recent as doc (doc.id)}
				<a class="item" class:active={activePath === docHref(current.id, doc.slug)} href={docHref(current.id, doc.slug)}>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
						<path d="M14 3v5h5" />
					</svg>
					<span class="label">{doc.title || m.doc_untitled()}</span>
				</a>
			{/each}
		{/if}

		{#if tagCounts.length > 0}
			<p class="head">{m.sidebar_tags()}</p>
			{#each tagCounts as t (t.tag)}
				<a
					class="item tag"
					class:active={activeTags.includes(t.tag)}
					href={workspaceHref(current.id, { tags: toggleTag(activeTags, t.tag) })}
				>
					<span class="hash">#</span>
					<span class="label">{t.tag}</span>
					<span class="count">{t.count}</span>
				</a>
			{/each}
		{/if}
	</nav>

	<PrefsMenu {user} {workspaces} currentId={current.id} {onOpenSettings} {onOpenWorkspaces} />
</aside>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		width: var(--rail-width);
		height: 100dvh;
		flex-shrink: 0;
		background: var(--bg-rail);
		border-inline-end: 1px solid var(--border);
		view-transition-name: rail;
	}

	.rail-head {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 4px;
	}

	.rail-hide {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-faint);
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.rail-hide:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.rail-top {
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.brand {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 46px;
		padding: 0 8px;
		border-radius: var(--radius-sm);
		transition: background-color 120ms ease;
	}
	.brand:hover {
		background: var(--surface-hover);
	}
	.brand img {
		height: 26px;
		width: auto;
		max-width: 100%;
	}
	.pos {
		display: none;
	}
	.neg {
		display: block;
	}
	.brand.no-neg .pos {
		display: block;
	}
	@media (prefers-color-scheme: light) {
		:global(:root:not([data-theme='dark'])) .pos {
			display: block;
		}
		:global(:root:not([data-theme='dark'])) .neg {
			display: none;
		}
	}
	:global(:root[data-theme='light']) .pos {
		display: block;
	}
	:global(:root[data-theme='light']) .neg {
		display: none;
	}
	.wordmark {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text-faint);
		font-size: 13px;
		cursor: pointer;
	}
	.search:hover {
		border-color: var(--border-strong);
		color: var(--text-muted);
	}
	.search span {
		flex: 1;
		text-align: start;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	kbd {
		font-family: var(--font-ui);
		font-size: 10.5px;
		padding: 1px 5px;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-faint);
	}

	.rail-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 8px 16px;
	}

	.head {
		margin: 16px 0 4px;
		padding-inline: 8px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.4;
	}
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item.active {
		background: var(--surface-active);
		color: var(--text);
		font-weight: 500;
	}
	.item svg {
		flex-shrink: 0;
		color: var(--text-faint);
	}

	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.count {
		font-size: 11.5px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.hash {
		width: 15px;
		flex-shrink: 0;
		text-align: center;
		color: var(--text-faint);
	}
	.tag.active .hash {
		color: var(--brand);
	}
</style>
