<script lang="ts">
	import DocIndex from '$lib/components/DocIndex.svelte';
	import DraftTray from '$lib/components/DraftTray.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<DocIndex
	workspace={data.workspace}
	page={data.page}
	activeTags={data.tags}
	sort={data.sort}
	canWrite={data.canWrite}
/>

<div class="tray-wrap">
	<DraftTray workspaceId={data.workspace.id} drafts={data.drafts} />
</div>

<style>
	/* Matches DocIndex's own column so the tray lines up under the doc list. */
	.tray-wrap {
		max-width: 900px;
		margin: -48px auto 0;
		padding: 0 32px 64px;
	}
</style>
