<script lang="ts">
	import { page } from '$app/stores';
	import type { Branding } from './branding';

	let { height = 28, href = '/' }: { height?: number; href?: string } = $props();

	const branding = $derived($page.data.branding as Branding);
	let imageFailed = $state(false);
	const showImage = $derived(!!branding?.logoUrl && !imageFailed);
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
		<span class="brand-text" style="font-size: {Math.round(height * 0.62)}px; line-height: {height}px;">
			{branding?.name ?? 'Docs'}
		</span>
	{/if}
</a>

<style>
	.brand-logo {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		text-decoration: none;
	}
	.brand-text {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--brand);
		white-space: nowrap;
	}
</style>
