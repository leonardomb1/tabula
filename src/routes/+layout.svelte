<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import AIDock from '$lib/AIDock.svelte';
	import WorkspaceModal from '$lib/WorkspaceModal.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	let { children, data } = $props();

	// Current document slug — present on [slug] viewer and /new?edit=<slug>.
	// Threaded into the AI dock so the server can bias context toward the doc
	// the user is looking at.
	const currentSlug = $derived(
		page.params.slug ?? page.url.searchParams.get('edit') ?? null
	);

	// Global delegate for the .code-copy button rendered inside every code
	// block by the markdown pipeline. Using delegation (rather than a handler
	// per button) keeps dynamically-streamed content — AI answers, live
	// preview — working without re-wiring on every render.
	onMount(() => {
		async function onClick(e: MouseEvent) {
			const target = e.target as HTMLElement | null;
			const btn = target?.closest?.('.code-copy') as HTMLButtonElement | null;
			if (!btn) return;
			const block = btn.closest('.code-block');
			const code = block?.querySelector('pre > code');
			const text = code?.textContent ?? '';
			if (!text) return;
			try {
				await navigator.clipboard.writeText(text);
			} catch {
				return;
			}
			btn.classList.add('is-copied');
			setTimeout(() => btn.classList.remove('is-copied'), 1200);
		}
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- --brand declared on :root (not on .app-root) so every derived
	     custom property — --accent, --accent-ink, --accent-soft — is
	     computed against the brand color regardless of where in the
	     tree the consumer sits. Matches the PDF export path which
	     also injects into :root. -->
	{@html `<style>:root{--brand:${data.branding.color}}</style>`}
</svelte:head>

<div class="app-root">
	{@render children()}

	{#if data.user}
		<AIDock currentSlug={currentSlug} />
		<WorkspaceModal />
	{/if}
</div>
