<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import DocEditor from '$lib/components/DocEditor.svelte';
	import { workspaceHref } from '$lib/nav';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.doc_new_title()}</title>
</svelte:head>

<DocEditor
	workspaceId={data.current?.id ?? ''}
	templates={data.templates}
	action=""
	submitLabel={m.doc_create()}
	cancelHref={workspaceHref(data.current?.id ?? '')}
	error={form?.error ?? null}
	initial={{
		title: form?.title ?? '',
		tags: form?.tags ?? [],
		mode: form?.mode ?? 'markdown',
		source: form?.source ?? ''
	}}
/>
