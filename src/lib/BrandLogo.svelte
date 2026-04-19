<script lang="ts">
	import { page } from '$app/stores';
	import type { Branding } from './branding';

	let { height = 26, href = '/' }: { height?: number; href?: string } = $props();

	const branding = $derived($page.data.branding as Branding);
	let imageFailed = $state(false);
	const showImage = $derived(!!branding?.logoUrl && !imageFailed);

	// First grapheme of the brand name for the fallback mark. Handles
	// multi-byte chars correctly (e.g. an emoji brand mark).
	const mark = $derived([...((branding?.name ?? 'D'))][0]?.toUpperCase() ?? 'D');
</script>

<a {href} class="brand-logo" aria-label={branding?.name ?? 'Docs'}>
	{#if showImage}
		<img
			src={branding.logoUrl}
			alt={branding.name}
			style="height: {height}px; width: auto; display: block;"
			onerror={() => (imageFailed = true)}
		/>
	{:else}
		<span class="brand-mark" style="width: {height - 4}px; height: {height - 4}px; font-size: {Math.round(height * 0.58)}px;">
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
