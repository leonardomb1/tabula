<script lang="ts">
	/**
	 * Renders a document's HTML and makes its Typst figures expandable: diagrams
	 * are fitted to the column width, which is often too small to read. The
	 * expand button is attached to each figure at runtime because the markup
	 * arrives as raw HTML, out of reach of the template.
	 */
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages';
	import { dur } from '$lib/motion';

	let { html, mode = 'markdown' }: { html: string; mode?: 'markdown' | 'typst' } = $props();

	let root = $state<HTMLDivElement | null>(null);
	let zoomed = $state<{ src: string; alt: string } | null>(null);

	const ICON =
		'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M9 21H3v-6M3 21l7-7"/></svg>';

	$effect(() => {
		html;
		const el = root;
		if (!el) return;
		for (const fig of el.querySelectorAll('.typst-figure')) {
			if (fig.querySelector('.figure-zoom')) continue;
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'figure-zoom';
			btn.title = m.figure_expand();
			btn.setAttribute('aria-label', m.figure_expand());
			btn.innerHTML = ICON;
			fig.appendChild(btn);
		}
	});

	function onBodyClick(event: MouseEvent) {
		const fig = (event.target as HTMLElement | null)?.closest?.('.typst-figure');
		const img = fig?.querySelector('img');
		if (!img) return;
		event.preventDefault();
		zoomed = { src: img.src, alt: img.alt };
	}

	function close() {
		zoomed = null;
	}

	function onKeydown(event: KeyboardEvent) {
		if (zoomed && event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	bind:this={root}
	class={mode === 'typst' ? 'typst-body' : 'prose'}
	onclick={onBodyClick}
>
	{@html html}
</div>

{#if zoomed}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="scrim" transition:fade={{ duration: dur(140) }} onclick={close}></div>

	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="wrap" onclick={close}>
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-label={m.figure_expanded()}
			transition:scale={{ duration: dur(160), start: 0.98, easing: cubicOut }}
		>
			<button type="button" class="close" aria-label={m.figure_close()} onclick={close}>
				<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
			<img src={zoomed.src} alt={zoomed.alt} />
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgb(0 0 0 / 0.55);
	}

	.wrap {
		position: fixed;
		inset: 0;
		z-index: 61;
		display: grid;
		place-items: center;
		padding: 32px;
	}

	.panel {
		position: relative;
		display: flex;
		max-width: 100%;
		max-height: 100%;
		padding: 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	/* Vector output, so it stays crisp at any size. */
	.panel img {
		max-width: 100%;
		max-height: calc(100dvh - 100px);
		width: auto;
		height: auto;
		object-fit: contain;
		filter: var(--typst-filter, none);
	}

	.close {
		position: absolute;
		top: -14px;
		inset-inline-end: -14px;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		cursor: pointer;
	}
	.close:hover {
		color: var(--text);
	}

	@media (max-width: 720px) {
		.wrap {
			padding: 14px;
		}
		.panel {
			padding: 12px;
		}
	}
</style>
