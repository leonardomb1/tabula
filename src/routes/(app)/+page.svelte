<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import DocIndex from '$lib/components/DocIndex.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

{#if data.current && data.page}
	<DocIndex
		workspace={data.current}
		page={data.page}
		activeTags={data.tags}
		sort={data.sort}
		canWrite={data.canWrite}
	/>
{:else}
	<p class="empty">{m.workspaces_empty()}</p>
{/if}

<style>
	.empty {
		max-width: 900px;
		margin: 0 auto;
		padding: 40px 32px;
		color: var(--text-faint);
	}
</style>
