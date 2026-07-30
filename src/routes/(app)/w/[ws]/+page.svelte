<script lang="ts">
	import DocIndex from '$lib/components/DocIndex.svelte';
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
