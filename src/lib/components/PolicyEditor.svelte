<script lang="ts">
	/**
	 * Editor for one workspace's internal rules. Mount under {#key wsId} so switching
	 * workspaces starts a fresh draft.
	 */
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import Toggle from './Toggle.svelte';
	import { capLabel } from '$lib/labels';
	import { CAPABILITIES, type WorkspacePolicy } from '$lib/policy';

	let {
		wsId,
		policy,
		section,
		saved = false
	}: {
		wsId: string;
		policy: WorkspacePolicy;
		bindings?: { attribute: string; value: string; role: string }[];
		claims?: Record<string, string[]>;
		// Display text comes from attributeLabel, not the row: an attribute is a
		// claim name, so most have no written label to carry.
		attributes?: { key: string }[];
		section: 'general' | 'access' | 'policy' | 'review' | 'repo';
		saved?: boolean;
	} = $props();

	let draft = $state(structuredClone(untrack(() => policy)));

	function fingerprint(p: WorkspacePolicy): string {
		return JSON.stringify([CAPABILITIES.map((c) => p.editor[c]), p.allowPublic, p.approvePublic]);
	}

	const dirty = $derived(fingerprint(draft) !== fingerprint(policy));

	function discard() {
		draft = structuredClone(policy);
	}
</script>

{#if section === 'policy'}
	<div class="block">
		<h2>{m.admin_policy_editor_title()}</h2>
		<p class="hint">{m.admin_policy_editor_hint()}</p>
		{#each CAPABILITIES as cap (cap)}
			<Toggle bind:checked={draft.editor[cap]} label={capLabel[cap]()} />
		{/each}
	</div>

	<div class="block">
		<h2>{m.admin_public_title()}</h2>
		<Toggle
			bind:checked={draft.allowPublic}
			label={m.admin_allow_public()}
			hint={m.admin_allow_public_hint()}
		/>
	</div>
{/if}

{#if section === 'review'}
	<div class="block">
		<h2>{m.admin_review_options()}</h2>
		<Toggle
			bind:checked={draft.approvePublic}
			label={m.admin_approve_public()}
			hint={m.admin_approve_public_hint()}
		/>
	</div>
{/if}

<form class="bar" class:show={dirty} method="POST" action="?/savePolicy" use:enhance>
	<input type="hidden" name="ws" value={wsId} />
	<input type="hidden" name="policy" value={JSON.stringify(draft)} />
	<span class="bar-text">{m.admin_unsaved()}</span>
	<button type="button" class="ghost" onclick={discard}>{m.admin_discard()}</button>
	<button type="submit" class="primary">{m.admin_save()}</button>
</form>

{#if saved && !dirty}
	<p class="saved">{m.admin_saved()}</p>
{/if}

<style>
	h2 {
		margin: 0 0 2px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.hint {
		margin: 0 0 8px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-faint);
		max-width: 62ch;
	}

	.saved {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: var(--text-muted);
	}

	.block {
		padding: 16px 0;
		border-bottom: 1px solid var(--border);
	}
	.block:last-of-type {
		border-bottom: 0;
	}

	.primary,
	.ghost {
		flex: none;
		height: 30px;
		padding: 0 13px;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.primary {
		border: 0;
		background: var(--brand);
		color: #fff;
	}
	.ghost {
		border: 0;
		background: none;
		color: var(--text-muted);
		font-weight: 500;
	}
	.ghost:hover {
		color: var(--text);
	}

	.bar {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
		padding: 11px 14px;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
		opacity: 0;
		transform: translateY(6px);
		pointer-events: none;
		transition: opacity 140ms ease, transform 140ms ease;
	}
	.bar.show {
		opacity: 1;
		transform: none;
		pointer-events: auto;
	}
	.bar-text {
		flex: 1;
		font-size: 12.5px;
		color: var(--text-muted);
	}
</style>
