<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import OnboardingDialog from '$lib/components/OnboardingDialog.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import WorkspaceDialog from '$lib/components/WorkspaceDialog.svelte';
	import { parseTagsParam } from '$lib/docs';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	let paletteOpen = $state(false);
	let settingsOpen = $state(false);
	let workspacesOpen = $state(false);
	let onboardingOpen = $state(false);

	const activeTags = $derived(parseTagsParam(page.url.searchParams.get('tags')));

	onMount(() => {
		if (!data.profile.onboarded) onboardingOpen = true;
	});
</script>

<div class="shell">
	{#if data.current}
		<Sidebar
			workspaces={data.workspaces}
			current={data.current}
			recent={data.recent}
			tagCounts={data.tagCounts}
			total={data.total}
			{activeTags}
			user={data.user}
			canWrite={data.canWrite}
			onOpenSearch={() => (paletteOpen = true)}
			onOpenSettings={() => (settingsOpen = true)}
			onOpenWorkspaces={() => (workspacesOpen = true)}
		/>
		<CommandPalette bind:open={paletteOpen} workspaceId={data.current.id} />
	{/if}

	<main class="content">
		{@render children()}
	</main>
</div>

<SettingsDialog
	bind:open={settingsOpen}
	user={data.user}
	profile={data.profile}
	onProfileSaved={invalidateAll}
/>

<WorkspaceDialog
	bind:open={workspacesOpen}
	workspaces={data.workspaces}
	currentId={data.current?.id ?? ''}
/>

<OnboardingDialog
	bind:open={onboardingOpen}
	canWrite={data.workspaces.some((w) => w.role === 'editor' || w.role === 'maintainer') ||
		data.user.isPlatformAdmin}
	username={data.user.username}
	directoryName={data.user.displayName ?? ''}
	onDone={invalidateAll}
/>

<style>
	.shell {
		display: flex;
		height: 100dvh;
		overflow: hidden;
	}

	.content {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		view-transition-name: page-content;
	}

	@media (max-width: 720px) {
		.shell {
			flex-direction: column;
			height: auto;
			min-height: 100dvh;
			overflow: visible;
		}
	}
</style>
