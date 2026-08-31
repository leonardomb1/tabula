<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		DEFAULT_READING_SIZE,
		DEFAULT_READING_WIDTH,
		READING_FONTS,
		READING_FONT_FAMILIES,
		READING_FONT_NAMES,
		READING_SIZES,
		READING_WIDTHS,
		getReadingFont,
		getReadingSize,
		getReadingWidth,
		setReadingFont,
		setReadingSize,
		setReadingWidth,
		type ReadingFont
	} from '$lib/preferences';

	let open = $state(false);
	let font = $state<ReadingFont>('serif');
	let size = $state(DEFAULT_READING_SIZE);
	let width = $state(DEFAULT_READING_WIDTH);
	let root = $state<HTMLDivElement | null>(null);

	onMount(() => {
		font = getReadingFont();
		size = getReadingSize();
		width = getReadingWidth();
	});

	$effect(() => {
		if (open) root?.querySelector('.font-row.selected')?.scrollIntoView({ block: 'nearest' });
	});

	const localized: Partial<Record<ReadingFont, () => string>> = {
		serif: m.font_serif,
		sans: m.font_sans,
		mono: m.font_mono
	};
	const fontName = (f: ReadingFont) => localized[f]?.() ?? READING_FONT_NAMES[f] ?? f;

	function step(steps: number[], current: number, dir: 1 | -1): number {
		const i = steps.indexOf(current);
		if (i < 0) return steps[dir > 0 ? 0 : steps.length - 1];
		return steps[Math.min(steps.length - 1, Math.max(0, i + dir))];
	}

	function bumpSize(dir: 1 | -1) {
		size = step(READING_SIZES, size, dir);
		setReadingSize(size);
	}

	function bumpWidth(dir: 1 | -1) {
		width = step(READING_WIDTHS, width, dir);
		setReadingWidth(width);
	}

	function onWindowClick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) open = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (open && event.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="reader-prefs" bind:this={root}>
	<button
		type="button"
		class="trigger"
		class:on={open}
		aria-expanded={open}
		aria-label={m.reader_prefs()}
		title={m.reader_prefs()}
		onclick={() => (open = !open)}
	>
		<span class="aa">Aa</span>
	</button>

	{#if open}
		<div class="pop" role="group" aria-label={m.reader_prefs()}>
			<p class="head">{m.font_label()}</p>
			<div class="fonts">
				{#each READING_FONTS as option (option)}
					<button
						type="button"
						class="font-row"
						class:selected={font === option}
						onclick={() => {
							font = option;
							setReadingFont(option);
						}}
					>
						<span class="sample" style:font-family={READING_FONT_FAMILIES[option]}>Ag</span>
						<span class="fname">{fontName(option)}</span>
						{#if font === option}
							<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="m5 12.5 4.5 4.5L19 7" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>

			<div class="row">
				<span class="label">{m.reader_size()}</span>
				<div class="stepper">
					<button
						type="button"
						aria-label={m.reader_size_down()}
						disabled={size === READING_SIZES[0]}
						onclick={() => bumpSize(-1)}
					>
						<span class="a small">A</span>
					</button>
					<span class="value">{size}</span>
					<button
						type="button"
						aria-label={m.reader_size_up()}
						disabled={size === READING_SIZES[READING_SIZES.length - 1]}
						onclick={() => bumpSize(1)}
					>
						<span class="a">A</span>
					</button>
				</div>
			</div>

			<div class="row">
				<span class="label">{m.reader_width()}</span>
				<div class="stepper">
					<button
						type="button"
						aria-label={m.reader_width_down()}
						disabled={width === READING_WIDTHS[0]}
						onclick={() => bumpWidth(-1)}
					>
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 5v14M20 5v14M7 12h4M9 10l2 2-2 2M17 12h-4M15 10l-2 2 2 2" />
						</svg>
					</button>
					<span class="value">{width}</span>
					<button
						type="button"
						aria-label={m.reader_width_up()}
						disabled={width === READING_WIDTHS[READING_WIDTHS.length - 1]}
						onclick={() => bumpWidth(1)}
					>
						<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<path d="M4 5v14M20 5v14M7 12h10M9.5 9.5 7 12l2.5 2.5M14.5 9.5 17 12l-2.5 2.5" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.reader-prefs {
		position: relative;
		display: inline-flex;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		padding: 4px 8px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.trigger:hover,
	.trigger.on {
		background: var(--surface-hover);
		color: var(--text);
	}
	.aa {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.pop {
		position: absolute;
		top: calc(100% + 6px);
		inset-inline-end: 0;
		z-index: 30;
		width: 248px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
	}

	.head {
		margin: 0 0 6px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.fonts {
		display: flex;
		flex-direction: column;
		gap: 1px;
		/* Four rows, plus half of the fifth so the scroll is discoverable. */
		max-height: 122px;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}
	.font-row {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 5px 7px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		text-align: start;
	}
	.font-row:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.font-row.selected {
		background: var(--surface-active);
		color: var(--text);
	}
	.font-row svg {
		flex: none;
		color: var(--brand);
	}
	.sample {
		flex: none;
		width: 24px;
		font-size: 14px;
		line-height: 1;
		text-align: center;
		color: var(--text);
	}
	.fname {
		flex: 1;
		min-width: 0;
		font-size: 12.5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 10px;
	}

	.label {
		font-size: 12.5px;
		color: var(--text-muted);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-sm);
		background: var(--bg-rail);
	}
	.stepper button {
		display: grid;
		place-items: center;
		width: 28px;
		height: 24px;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
	}
	.stepper button:hover:not(:disabled) {
		background: var(--surface);
		color: var(--text);
	}
	.stepper button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.value {
		min-width: 24px;
		text-align: center;
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
		color: var(--text-faint);
	}
	.a {
		font-size: 13px;
		font-weight: 600;
	}
	.a.small {
		font-size: 10.5px;
	}
</style>
