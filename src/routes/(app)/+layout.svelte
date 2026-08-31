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
	import { getRailOpen, setRailOpen } from '$lib/preferences';
	import * as m from '$lib/paraglide/messages';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	let paletteOpen = $state(false);
	let settingsOpen = $state(false);
	let workspacesOpen = $state(false);
	let onboardingOpen = $state(false);
	let railOpen = $state(true);

	const activeTags = $derived(parseTagsParam(page.url.searchParams.get('tags')));

	onMount(() => {
		railOpen = getRailOpen();
		if (!data.profile.onboarded) onboardingOpen = true;
	});

	// Visibility itself is CSS on :root[data-rail] so the boot script can apply
	// the stored choice before paint; this state only tracks it for aria.
	function toggleRail() {
		railOpen = !railOpen;
		setRailOpen(railOpen);
	}
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
			ontoggle={toggleRail}
		/>
		<CommandPalette bind:open={paletteOpen} workspaceId={data.current.id} />
		<button
			type="button"
			class="rail-reopen"
			aria-label={m.sidebar_show()}
			title={m.sidebar_show()}
			aria-expanded={railOpen}
			onclick={toggleRail}
		>
			<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M3 5h18v14H3zM9 5v14M14 10l2 2-2 2" />
			</svg>
		</button>
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

	.rail-reopen {
		display: none;
		position: fixed;
		top: 10px;
		inset-inline-start: 10px;
		z-index: 40;
		place-items: center;
		width: 28px;
		height: 28px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-muted);
		cursor: pointer;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
	}
	:global(:root[data-rail='closed']) .rail-reopen {
		display: grid;
	}
	.rail-reopen:hover {
		color: var(--text);
		border-color: var(--border-strong);
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
