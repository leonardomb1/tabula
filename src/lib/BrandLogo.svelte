<script lang="ts">
	import { page } from '$app/stores';
	import type { Branding } from './branding';

	let { height = 26, href = '/' }: { height?: number; href?: string } = $props();

	const branding = $derived($page.data.branding as Branding);

	// Both variants are rendered; CSS (not JS) hides the wrong one based on
	// `data-theme` on <html> (the existing FOUC script) plus
	// prefers-color-scheme for the auto case. This means:
	//   • zero post-hydration swaps, zero layout-flash
	//   • both URLs get requested on first visit — *once*, thanks to the
	//     long cache-control from /api/branding/[file]
	//   • subsequent visits: both served from browser cache, free
	//
	// Failure-tracking stays reactive: a 404 on logo_negative.svg flips
	// `negativeFailed`, which drops the negative img from the DOM and
	// promotes the positive one to show in dark mode too.
	let negativeFailed = $state(false);
	let positiveFailed = $state(false);

	const showPositive = $derived(!!branding?.logoUrl && !positiveFailed);
	const showNegative = $derived(
		!!branding?.logoNegativeUrl && !negativeFailed
	);
	const showText = $derived(!showPositive && !showNegative);

	const mark = $derived([...(branding?.name ?? 'D')][0]?.toUpperCase() ?? 'D');
</script>

<a {href} class="brand-logo" class:neg-missing={!showNegative} aria-label={branding?.name ?? 'Docs'}>
	{#if showPositive && branding}
		<img
			src={branding.logoUrl}
			alt={branding.name}
			class="logo logo-positive"
			style="height: {height}px; width: auto;"
			onerror={() => (positiveFailed = true)}
		/>
	{/if}
	{#if showNegative && branding}
		<img
			src={branding.logoNegativeUrl}
			alt={branding.name}
			class="logo logo-negative"
			style="height: {height}px; width: auto;"
			onerror={() => (negativeFailed = true)}
		/>
	{/if}
	{#if showText}
		<span
			class="brand-mark"
			style="width: {height - 4}px; height: {height - 4}px; font-size: {Math.round(height * 0.58)}px;"
		>
			{mark}
		</span>
		<span class="brand-text" style="font-size: {Math.round(height * 0.78)}px; line-height: {height}px;">
			{branding?.name ?? 'Docs'}
		</span>
	{/if}
</a>

<style>
	.brand-logo {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.logo { display: block; }

	/* Default (papel / light): show positive, hide negative. */
	.logo-negative { display: none; }

	/* Tinta explicitly selected → flip. */
	:global(:root[data-theme='dark']) .logo-positive { display: none; }
	:global(:root[data-theme='dark']) .logo-negative { display: block; }

	/* Auto mode + OS dark → flip. The :not() guards prevent this from
	   overriding an explicit light choice when the OS is dark. */
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light']):not([data-theme='dark'])) .logo-positive { display: none; }
		:global(:root:not([data-theme='light']):not([data-theme='dark'])) .logo-negative { display: block; }
	}

	/* If the negative variant 404'd, re-promote the positive one in dark
	   mode so the header isn't empty. Class lives on the anchor so the
	   selector can reach back across the image siblings. */
	:global(:root[data-theme='dark']) .brand-logo.neg-missing .logo-positive { display: block; }
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light']):not([data-theme='dark'])) .brand-logo.neg-missing .logo-positive { display: block; }
	}

	.brand-mark {
		display: grid;
		place-items: center;
		background: var(--ink, #1a1a1a);
		color: var(--bg, #fff);
		border-radius: 4px;
		font-family: var(--font-serif-display, 'Fraunces Variable', ui-serif, Georgia, serif);
		font-weight: 700;
		line-height: 1;
		flex-shrink: 0;
	}

	.brand-text {
		font-family: var(--font-serif-display, 'Fraunces Variable', ui-serif, Georgia, serif);
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--ink, #1a1a1a);
		white-space: nowrap;
	}
</style>
