<script lang="ts">
	/**
	 * The workspace pill: a pill-shaped button with a circular badge +
	 * workspace name + a chevron. Clicking opens the workspace picker
	 * modal. Extracted so `/` and `/w/:ws/:slug` share the same shape and
	 * motion without drift.
	 */
	import { openWorkspaceModal, workspaceModal } from './workspaceModal.svelte';

	let { id, name }: { id: string; name: string } = $props();

	function initial(n: string): string {
		return (n.trim()[0] ?? '?').toUpperCase();
	}
</script>

<button
	type="button"
	class="ws-pill"
	class:is-opening={workspaceModal.open}
	onclick={openWorkspaceModal}
	aria-haspopup="dialog"
	aria-expanded={workspaceModal.open}
	aria-label="Workspace: {name}"
>
	{#key workspaceModal.pulseKey}
		<span class="badge" aria-hidden="true">{initial(name)}</span>
	{/key}
	<span class="name">{name}</span>
	<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
		<path d="M6 9l6 6 6-6"/>
	</svg>
</button>

<style>
	.ws-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 3px 10px 3px 3px;
		border: 1px solid var(--rule);
		border-radius: 999px;
		background: var(--surface);
		cursor: pointer;
		font-family: var(--font-sans);
		color: var(--ink);
		transition: background 0.15s, border-color 0.15s;
	}
	.ws-pill:hover { border-color: color-mix(in oklab, var(--rule) 60%, var(--ink) 20%); }
	.ws-pill.is-opening {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.badge {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-family: var(--font-serif-display);
		font-size: 12px;
		font-weight: 700;
		line-height: 1;
	}
	.ws-pill.is-opening .badge { animation: pillPulse 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.1); }
	@keyframes pillPulse {
		0% { transform: scale(1); }
		40% { transform: scale(1.35); }
		100% { transform: scale(1); }
	}

	.name { font-size: 13px; font-weight: 500; }

	.chev {
		width: 12px;
		height: 12px;
		color: var(--ink-muted);
		flex-shrink: 0;
		transition: transform 0.15s;
	}
	.ws-pill[aria-expanded='true'] .chev { transform: rotate(180deg); }

	@media (max-width: 640px) {
		/* Collapse to badge + chevron — the name is redundant with the
		   page masthead or document title on phone. */
		.name { display: none; }
		.ws-pill { padding: 3px 8px 3px 3px; }
	}
</style>
