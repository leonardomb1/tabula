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

	interface PeekData {
		title: string;
		excerpt: string;
		tags: string[];
	}
	let peek = $state<{ x: number; y: number; below: boolean; data: PeekData } | null>(null);
	const peekCache = new Map<string, PeekData | null>();
	let peekTimer: ReturnType<typeof setTimeout> | undefined;
	let peekAnchor: HTMLAnchorElement | null = null;

	function onPointerOver(event: PointerEvent) {
		const a = (event.target as HTMLElement | null)?.closest?.(
			'a.wiki-link:not(.broken)'
		) as HTMLAnchorElement | null;
		if (!a || a === peekAnchor) return;
		const match = a.getAttribute('href')?.match(/^\/w\/([^/]+)\/([^/?#]+)$/);
		if (!match) return;
		// The peek card supersedes the renderer's native title tooltip.
		a.removeAttribute('title');
		clearTimeout(peekTimer);
		peekAnchor = a;
		const [, ws, slug] = match;
		peekTimer = setTimeout(async () => {
			let data = peekCache.get(a.href);
			if (data === undefined) {
				data = await fetch(`/api/peek/${encodeURIComponent(ws)}/${encodeURIComponent(slug)}`)
					.then((r) => (r.ok ? (r.json() as Promise<PeekData>) : null))
					.catch(() => null);
				peekCache.set(a.href, data);
			}
			if (!data || peekAnchor !== a) return;
			const rect = a.getBoundingClientRect();
			const below = rect.bottom + 190 < window.innerHeight;
			peek = {
				x: Math.max(8, Math.min(rect.left, window.innerWidth - 336)),
				y: below ? rect.bottom + 6 : rect.top - 6,
				below,
				data
			};
		}, 300);
	}

	function onPointerOut(event: PointerEvent) {
		if (!(event.target as HTMLElement | null)?.closest?.('a.wiki-link')) return;
		const to = event.relatedTarget as HTMLElement | null;
		if (to?.closest?.('.peek')) return;
		clearTimeout(peekTimer);
		peekAnchor = null;
		peek = null;
	}

	function closePeek() {
		clearTimeout(peekTimer);
		peekAnchor = null;
		peek = null;
	}

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

<svelte:window onkeydown={onKeydown} onscrollcapture={closePeek} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	bind:this={root}
	class={mode === 'typst' ? 'typst-body' : 'prose'}
	onclick={onBodyClick}
	onpointerover={onPointerOver}
	onpointerout={onPointerOut}
>
	{@html html}
</div>

{#if peek}
	<div
		class="peek"
		role="tooltip"
		class:above={!peek.below}
		style:left="{peek.x}px"
		style:top="{peek.y}px"
		transition:fade={{ duration: dur(100) }}
		onpointerleave={closePeek}
	>
		<p class="peek-title">{peek.data.title || m.doc_untitled()}</p>
		{#if peek.data.excerpt}
			<p class="peek-excerpt">{peek.data.excerpt}</p>
		{/if}
		{#if peek.data.tags.length}
			<p class="peek-tags">
				{#each peek.data.tags as tag (tag)}<span>#{tag}</span>{/each}
			</p>
		{/if}
	</div>
{/if}

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
	.peek {
		position: fixed;
		z-index: 55;
		width: 328px;
		padding: 11px 13px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
		pointer-events: auto;
	}
	.peek.above {
		transform: translateY(-100%);
	}
	.peek-title {
		margin: 0 0 4px;
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 600;
		line-height: 1.3;
	}
	.peek-excerpt {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-muted);
		display: -webkit-box;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.peek-tags {
		margin: 7px 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.peek-tags span {
		font-size: 10.5px;
		color: var(--text-faint);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 7px;
	}

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
