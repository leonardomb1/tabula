<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import AskAI from '$lib/AskAI.svelte';
	import { page } from '$app/state';

	let { children, data } = $props();

	// Current document slug — present on [slug] view and /new?edit=slug
	const currentSlug = $derived(
		page.params.slug ?? page.url.searchParams.get('edit') ?? null
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="app-root" style="--brand: {data.branding.color}">
	{@render children()}

	{#if data.user}
		<AskAI currentSlug={currentSlug} />
	{/if}
</div>
