<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import AIDock from '$lib/AIDock.svelte';
	import WorkspaceModal from '$lib/WorkspaceModal.svelte';
	import { page } from '$app/state';

	let { children, data } = $props();

	// Current document slug — present on [slug] viewer and /new?edit=<slug>.
	// Threaded into the AI dock so the server can bias context toward the doc
	// the user is looking at.
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
		<AIDock currentSlug={currentSlug} />
		<WorkspaceModal />
	{/if}
</div>
