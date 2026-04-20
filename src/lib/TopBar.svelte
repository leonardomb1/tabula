<script lang="ts">
	/**
	 * Shared top bar for `/` and `/w/:ws/:slug`. Left slot: brand logo +
	 * workspace pill. Center: search pill. Right: `actions` snippet
	 * (page-specific button cluster) + UserMenu.
	 *
	 * Behaviour baked in:
	 *   - Sticky, frosted backdrop (::before).
	 *   - iOS safe-area-inset-top respected.
	 *   - Auto-hides on mobile scroll via `autoHideOnScroll`.
	 *   - Below 1024px: action cluster + workspace pill collapse (pages
	 *     move their actions into a FAB sheet owned by DocReader or
	 *     MobileSheet; workspace switching goes through UserMenu).
	 *
	 * The editor's top bar is not covered by this component — its layout
	 * is fundamentally different (back button, autosave, no search).
	 */
	import type { Snippet } from 'svelte';
	import BrandLogo from './BrandLogo.svelte';
	import Search from './Search.svelte';
	import UserMenu from './UserMenu.svelte';
	import WorkspacePill from './WorkspacePill.svelte';
	import { autoHideOnScroll } from './autoHideOnScroll';

	type TocEntry = { level: number; id: string; text: string };

	let {
		ws,
		pageHeadings,
		actions
	}: {
		/** The active workspace. Feeds WorkspacePill + Search's `wsId` filter. */
		ws: { id: string; name: string };
		/** Headings of the current doc — only meaningful on the reader; drops
		 *  the "Nesta página" group in Search when absent. */
		pageHeadings?: TocEntry[];
		/**
		 * Page-specific buttons (AI toggle, + Novo, Markdown, etc.).
		 * Expected to emit `.action-btn` or similar elements so they share
		 * the existing hover metrics.
		 */
		actions?: Snippet;
	} = $props();
</script>

<header class="top-bar" use:autoHideOnScroll>
	<div class="top-bar-inner">
		<div class="brand-slot">
			<a href="/" class="brand-logo" aria-label="Ir para o início">
				<BrandLogo height={26} />
			</a>
			<span class="brand-sep">/</span>
			<WorkspacePill id={ws.id} name={ws.name} />
		</div>

		<Search wsId={ws.id} wsName={ws.name} pageHeadings={pageHeadings} />

		<div class="right-slot">
			{#if actions}
				<div class="actions">{@render actions()}</div>
			{/if}
			<UserMenu />
		</div>
	</div>
</header>

<style>
	.top-bar {
		position: sticky;
		top: 0;
		z-index: 40;
		border-bottom: 1px solid var(--rule);
		padding-top: env(safe-area-inset-top);
		transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
		will-change: transform;
	}
	:global(.top-bar.is-hidden) { transform: translateY(-100%); }

	/* Frosted-glass backdrop on a pseudo-element so `backdrop-filter`
	   doesn't create a containing block — otherwise fixed descendants
	   (mobile bottom nav, legacy) would anchor to the top bar. */
	.top-bar::before {
		content: '';
		position: absolute;
		inset: 0;
		background: color-mix(in oklab, var(--bg) 88%, transparent);
		backdrop-filter: saturate(1.2) blur(10px);
		-webkit-backdrop-filter: saturate(1.2) blur(10px);
		z-index: -1;
	}

	.top-bar-inner {
		max-width: 1520px;
		margin: 0 auto;
		padding: 0 28px;
		height: 56px;
		display: grid;
		/* Balanced 1fr columns flanking a fixed-width search keep the
		   center pinned regardless of what's in brand or right slots. */
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 24px;
	}

	.brand-slot {
		display: flex;
		align-items: center;
		gap: 12px;
		justify-self: start;
		min-width: 0;
	}
	.brand-logo { display: inline-flex; }
	.brand-sep {
		color: var(--ink-muted);
		font-family: var(--font-serif-display);
	}

	.right-slot {
		display: flex;
		align-items: center;
		gap: 16px;
		justify-self: end;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* Search sits in the fixed-width center column. */
	:global(.top-bar-inner > .search-trigger) {
		width: clamp(240px, 38vw, 420px);
	}

	/* iPad portrait and smaller — action cluster folds into the page-level
	   FAB sheet. Workspace switching moves into the UserMenu dropdown, so
	   the pill and the separator come out too. Layout collapses to
	   brand | search | user since actions are hidden. */
	@media (max-width: 1024px) {
		.top-bar-inner {
			height: auto;
			padding: 10px 14px;
			gap: 10px;
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.right-slot { gap: 10px; }
		.actions { display: none; }
		:global(.top-bar-inner > .search-trigger) { width: 100%; }
		.brand-slot :global(.ws-pill),
		.brand-sep { display: none; }
	}

	@media (max-width: 640px) {
		.brand-slot { min-width: 0; flex-shrink: 1; }
		.brand-slot :global(.brand-text) { display: none; }
	}
</style>
