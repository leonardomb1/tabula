<script lang="ts">
	/**
	 * Single-panel FAB + bottom sheet — the stripped-down sibling of
	 * `DocReader`'s multi-tab sheet. Use on pages where there's only a list
	 * of actions to expose on mobile (dashboard, editor).
	 *
	 * The `.sheet-action` row styles live globally in `DocReader.svelte` so
	 * callers just emit `<button class="sheet-action">…` rows inside the
	 * snippet. No tab bar, no panels — one flat list.
	 */
	import type { Snippet } from 'svelte';

	let {
		label = 'Menu',
		open = $bindable(false),
		hideFab = false,
		anchor = 'bottom',
		topOffset = '0px',
		children
	}: {
		/** aria-label for the FAB button and sheet dialog. */
		label?: string;
		/** Externally-controlled open state. Defaults to internal control. */
		open?: boolean;
		/**
		 * Hide the built-in FAB. Use when the trigger lives elsewhere (e.g.
		 * an inline "⋯" button in a custom bottom bar). The parent becomes
		 * responsible for toggling `open` via the binding.
		 */
		hideFab?: boolean;
		/**
		 * Which edge the sheet anchors to. `"bottom"` slides up from below
		 * (default, for FAB triggers). `"top"` slides down from above, sitting
		 * below `topOffset` — use when the trigger is in a top bar so the
		 * motion originates at the tap target.
		 */
		anchor?: 'top' | 'bottom';
		/**
		 * Distance from the top of the viewport for `anchor="top"` — normally
		 * the height of the page's top bar so the sheet lands flush beneath
		 * it. CSS length string (e.g. `"48px"`).
		 */
		topOffset?: string;
		/** Sheet content — a list of `.sheet-action` rows. */
		children: Snippet;
	} = $props();

	function close() { open = false; }

	$effect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#if !hideFab}
	<button
		type="button"
		class="fab"
		class:is-hidden={open}
		onclick={() => (open = true)}
		aria-label={label}
		aria-expanded={open}
	>
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path d="M5 6h14M5 12h14M5 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
		</svg>
	</button>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="scrim"
	class:is-open={open}
	data-anchor={anchor}
	style:--sheet-top={topOffset}
	onclick={close}
	aria-hidden="true"
></div>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<section
	class="sheet"
	class:is-open={open}
	data-anchor={anchor}
	style:--sheet-top={topOffset}
	role="dialog"
	aria-modal="true"
	aria-label={label}
	aria-hidden={!open}
>
	{#if anchor === 'bottom'}
		<div class="sheet-grabber" aria-hidden="true"></div>
	{/if}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="sheet-body" onclick={close} role="presentation">
		{@render children()}
	</div>
	{#if anchor === 'top'}
		<div class="sheet-grabber" aria-hidden="true"></div>
	{/if}
</section>

<style>
	/* Mobile-only chrome — every rule hides above 720px. The FAB / sheet /
	   scrim share the same display: none baseline and get enabled together
	   inside the breakpoint below. */
	.fab,
	.scrim,
	.sheet { display: none; }

	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(env(safe-area-inset-bottom) + 20px);
		width: 56px;
		height: 56px;
		border-radius: 28px;
		background: var(--ink);
		color: var(--bg);
		align-items: center;
		justify-content: center;
		border: 0;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.10);
		z-index: 70;
		cursor: pointer;
		transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms;
	}
	.fab:active { transform: scale(0.96); }
	.fab.is-hidden {
		transform: translateY(90px);
		opacity: 0;
		pointer-events: none;
	}

	.scrim {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 80;
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms ease;
	}
	/* Bottom-anchored sheet: scrim covers everything. Top-anchored sheet:
	   scrim starts below the top bar so the navbar stays bright and the
	   ⋯ trigger remains tappable for a quick dismiss. */
	.scrim[data-anchor='bottom'] { top: 0; }
	.scrim[data-anchor='top'] { top: var(--sheet-top, 0); }
	.scrim.is-open { opacity: 1; pointer-events: auto; }

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 90;
		background: var(--bg);
		max-height: 78dvh;
		flex-direction: column;
		transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	/* Bottom-anchored (default) — slides up from the screen bottom. */
	.sheet[data-anchor='bottom'] {
		bottom: 0;
		border-top: 1px solid var(--rule);
		border-top-left-radius: 22px;
		border-top-right-radius: 22px;
		box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.2);
		padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
		transform: translateY(100%);
	}

	/* Top-anchored — slides down from under the top bar. The sheet's top
	   edge sits at --sheet-top (caller supplies the top-bar height). */
	.sheet[data-anchor='top'] {
		top: var(--sheet-top, 0);
		border-bottom: 1px solid var(--rule);
		border-bottom-left-radius: 22px;
		border-bottom-right-radius: 22px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		padding-top: 6px;
		padding-bottom: 4px;
		transform: translateY(calc(-1 * (100% + var(--sheet-top, 0px))));
	}

	.sheet.is-open { transform: translateY(0); }

	.sheet-grabber {
		height: 4px;
		width: 36px;
		border-radius: 2px;
		background: var(--rule);
		margin: 8px auto 12px;
		flex-shrink: 0;
	}

	.sheet-body {
		flex: 1;
		overflow-y: auto;
		padding: 0 0 8px;
		-webkit-overflow-scrolling: touch;
	}

	@media (max-width: 720px) {
		.fab { display: inline-flex; }
		.scrim { display: block; }
		.sheet { display: flex; }
	}
</style>
