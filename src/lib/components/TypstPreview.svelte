<script lang="ts">
	import { tick } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	let { svg, pages = 1 }: { svg: string; pages?: number } = $props();

	const MIN = 0.4;
	const MAX = 4;
	const STEP = 1.25;

	let zoom = $state(1);
	let pane = $state<HTMLDivElement | null>(null);

	// Zoom by widening the wrapper instead of transform: scale so the SVG
	// re-rasterizes and stays crisp; scroll offsets are rescaled around the
	// anchor point so the spot under the cursor stays put.
	async function zoomTo(next: number, ax?: number, ay?: number) {
		if (!pane) return;
		const target = Math.min(MAX, Math.max(MIN, next));
		if (target === zoom) return;
		const px = ax ?? pane.clientWidth / 2;
		const py = ay ?? pane.clientHeight / 2;
		const factor = target / zoom;
		const cx = (pane.scrollLeft + px) * factor;
		const cy = (pane.scrollTop + py) * factor;
		zoom = target;
		await tick();
		pane.scrollLeft = cx - px;
		pane.scrollTop = cy - py;
	}

	function onWheel(event: WheelEvent) {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		if (!pane) return;
		const rect = pane.getBoundingClientRect();
		zoomTo(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - rect.left, event.clientY - rect.top);
	}
</script>

<div class="viewer">
	<div class="toolbar">
		<span class="pages">{pages} {pages === 1 ? m.preview_page() : m.preview_pages()}</span>
		<span class="spacer"></span>
		<button type="button" class="zbtn" aria-label={m.preview_zoom_out()} onclick={() => zoomTo(zoom / STEP)}>
			<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
		</button>
		<button type="button" class="pct" title={m.preview_zoom_reset()} onclick={() => zoomTo(1)}>
			{Math.round(zoom * 100)}%
		</button>
		<button type="button" class="zbtn" aria-label={m.preview_zoom_in()} onclick={() => zoomTo(zoom * STEP)}>
			<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
		</button>
	</div>
	<div class="pane" bind:this={pane} onwheel={onWheel}>
		<div class="paper" style:width="{zoom * 100}%">
			{@html svg}
		</div>
	</div>
</div>

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 5px 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.pages {
		font-size: 11.5px;
		color: var(--text-faint);
	}

	.spacer {
		flex: 1;
	}

	.zbtn,
	.pct {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 22px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.zbtn {
		width: 22px;
	}
	.pct {
		min-width: 44px;
		padding: 0 6px;
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
	}
	.zbtn:hover,
	.pct:hover {
		background: var(--surface-active);
		color: var(--text);
	}

	.pane {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 14px;
		background: var(--surface);
	}

	/* The compiled document is paper regardless of app theme. */
	.paper {
		min-width: min-content;
		margin: 0 auto;
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
	}

	.paper :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
