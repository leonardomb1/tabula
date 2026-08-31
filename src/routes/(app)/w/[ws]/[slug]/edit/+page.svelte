<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import DocEditor from '$lib/components/DocEditor.svelte';
	import { docHref, historyHref } from '$lib/nav';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const wsId = $derived(page.params.ws ?? '');
	const canDelete = $derived(
		data.workspaces.find((w) => w.id === wsId)?.role === 'maintainer' || data.user.isPlatformAdmin
	);
</script>

<svelte:head>
	<title>{data.doc.title}</title>
</svelte:head>

<DocEditor
	workspaceId={wsId}
	docSlug={data.doc.slug}
	templates={data.templates}
	action="?/save"
	submitLabel={m.doc_save()}
	cancelHref={docHref(wsId, data.doc.slug)}
	error={form?.error ?? null}
	initial={{
		title: form?.title ?? data.doc.title,
		tags: form?.tags ?? data.doc.tags,
		mode: form?.mode ?? data.doc.mode,
		source: form?.source ?? data.doc.source,
		template: data.doc.template
	}}
>
	<a class="link" href={historyHref(wsId, data.doc.slug)}>
		<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" />
			<path d="M12 8v4.5l3 1.8" />
		</svg>
		{m.doc_history()}
	</a>
	{#if canDelete}
		<button
			class="link danger"
			type="submit"
			formaction="?/delete"
			formnovalidate
			onclick={(e) => {
				if (!confirm(m.doc_delete_confirm())) e.preventDefault();
			}}
		>
			<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
			</svg>
			{m.doc_delete()}
		</button>
	{/if}
</DocEditor>

<style>
	.link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 9px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-faint);
		font-size: 13px;
		cursor: pointer;
		white-space: nowrap;
	}
	.link svg {
		flex: none;
	}
	.link:hover {
		color: var(--text);
	}
	.link.danger:hover {
		color: var(--danger);
	}
</style>
