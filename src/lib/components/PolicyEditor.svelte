<script lang="ts">
	/**
	 * Editor for one workspace's internal rules. Mount under {#key wsId} so switching
	 * workspaces starts a fresh draft.
	 */
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import Toggle from './Toggle.svelte';
	import { attrLabel, capLabel, label } from '$lib/labels';
	import {
		CAPABILITIES,
		MAX_QUORUM,
		approverBound,
		type ReviewMode,
		type WorkspacePolicy
	} from '$lib/policy';
	import { ATTR, matchesSelector, type Selector } from '$lib/rbac';

	let {
		wsId,
		policy,
		bindings,
		claims,
		attributes,
		section,
		saved = false
	}: {
		wsId: string;
		policy: WorkspacePolicy;
		bindings: { attribute: string; value: string; role: string }[];
		claims: Record<string, string[]>;
		attributes: { key: string; label: string }[];
		section: 'general' | 'access' | 'policy' | 'review';
		saved?: boolean;
	} = $props();

	let draft = $state(structuredClone(untrack(() => policy)));

	function fingerprint(p: WorkspacePolicy): string {
		return JSON.stringify([
			CAPABILITIES.map((c) => p.editor[c]),
			p.viewersMayPropose,
			p.allowPublic,
			p.review.mode,
			p.review.quorum,
			p.review.approvers.map((a) => `${a.attribute} ${a.value}`),
			p.review.selfApprove,
			p.review.maintainerBypass,
			p.review.approveDeletes,
			p.review.approvePublic
		]);
	}

	const dirty = $derived(fingerprint(draft) !== fingerprint(policy));

	function discard() {
		draft = structuredClone(policy);
	}

	function setMode(mode: ReviewMode) {
		draft.review.mode = mode;
		if (mode === 'off') draft.viewersMayPropose = false;
	}

	const maintainerSelectors = $derived(
		bindings
			.filter((b) => b.role === 'maintainer')
			.map((b) => ({ attribute: b.attribute, value: b.value }))
	);

	const bound = $derived(approverBound(draft, maintainerSelectors));
	const deadlocked = $derived(bound.exact && draft.review.quorum > bound.count);

	let approverAttr = $state(ATTR.USER as string);
	let approverValue = $state('');

	const approverAttrs = $derived(attributes.filter((a) => a.key !== ATTR.WILDCARD));

	function addApprover() {
		const value = approverValue.trim();
		if (!value) return;
		const exists = draft.review.approvers.some(
			(a) => a.attribute === approverAttr && a.value === value
		);
		if (!exists) draft.review.approvers.push({ attribute: approverAttr, value });
		approverValue = '';
	}

	const modes: { id: ReviewMode; label: () => string; hint: () => string }[] = [
		{ id: 'off', label: m.admin_review_off, hint: m.admin_review_off_hint },
		{ id: 'new', label: m.admin_review_new, hint: m.admin_review_new_hint },
		{ id: 'all', label: m.admin_review_all, hint: m.admin_review_all_hint }
	];

	function matchesYou(sel: Selector): boolean {
		return matchesSelector(sel, claims);
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
		<h2>{m.admin_review_mode()}</h2>
		<div class="modes">
			{#each modes as opt (opt.id)}
				<button
					type="button"
					class="mode"
					class:on={draft.review.mode === opt.id}
					aria-pressed={draft.review.mode === opt.id}
					onclick={() => setMode(opt.id)}
				>
					<span class="mode-label">{opt.label()}</span>
					<span class="mode-hint">{opt.hint()}</span>
				</button>
			{/each}
		</div>
	</div>

	<div class="block">
		<h2>{m.admin_approvers_title()}</h2>
		<p class="hint">{m.admin_approvers_hint()}</p>

		{#if draft.review.approvers.length === 0}
			<p class="none">{m.admin_approvers_empty()}</p>
		{:else}
			<ul class="rules">
				{#each draft.review.approvers as a, i (`${a.attribute}/${a.value}`)}
					<li>
						<span class="rule-attr">{label(attrLabel, a.attribute)}</span>
						<code class="rule-value">{a.value}</code>
						{#if matchesYou(a)}
							<span class="badge">
								<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="m5 12.5 4.5 4.5L19 7" />
								</svg>
								{m.admin_matches_you()}
							</span>
						{/if}
						<button
							type="button"
							class="icon"
							aria-label={m.admin_remove_rule()}
							onclick={() => draft.review.approvers.splice(i, 1)}
						>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
								<path d="M6 6l12 12M18 6L6 18" />
							</svg>
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="add-rule">
			<select bind:value={approverAttr} class="attr" aria-label={m.admin_attribute()}>
				<button><selectedcontent></selectedcontent></button>
				{#each approverAttrs as a (a.key)}
					<option value={a.key}>{label(attrLabel, a.key)}</option>
				{/each}
			</select>
			<input
				bind:value={approverValue}
				placeholder={m.admin_value()}
				autocomplete="off"
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						addApprover();
					}
				}}
			/>
			<button type="button" class="secondary" onclick={addApprover}>{m.admin_add_rule()}</button>
		</div>
	</div>

	<div class="block">
		<h2>{m.admin_quorum()}</h2>
		<div class="quorum">
			<input
				type="number"
				min="1"
				max={MAX_QUORUM}
				bind:value={draft.review.quorum}
				aria-label={m.admin_quorum()}
			/>
			<span class="bound">
				{bound.exact
					? m.admin_quorum_bound_exact({ count: bound.count })
					: m.admin_quorum_bound_min({ count: bound.count })}
			</span>
		</div>
		{#if deadlocked}
			<p class="warn">{m.admin_quorum_deadlock()}</p>
		{/if}
	</div>

	<div class="block">
		<h2>{m.admin_review_options()}</h2>
		<Toggle
			bind:checked={draft.review.approvePublic}
			label={m.admin_approve_public()}
			hint={m.admin_approve_public_hint()}
		/>
		<Toggle bind:checked={draft.review.approveDeletes} label={m.admin_approve_deletes()} />
		<Toggle bind:checked={draft.review.maintainerBypass} label={m.admin_maintainer_bypass()} />
		<Toggle bind:checked={draft.review.selfApprove} label={m.admin_self_approve()} />
		<Toggle
			bind:checked={draft.viewersMayPropose}
			label={m.admin_viewers_propose()}
			hint={m.admin_viewers_propose_hint()}
			disabled={draft.review.mode === 'off'}
		/>
	</div>
{/if}

<form class="bar" class:show={dirty} method="POST" action="?/savePolicy" use:enhance>
	<input type="hidden" name="ws" value={wsId} />
	<input type="hidden" name="policy" value={JSON.stringify(draft)} />
	<span class="bar-text">{m.admin_unsaved()}</span>
	<button type="button" class="ghost" onclick={discard}>{m.admin_discard()}</button>
	<button type="submit" class="primary" disabled={deadlocked}>{m.admin_save()}</button>
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

	.none {
		margin: 8px 0;
		font-size: 12.5px;
		color: var(--text-faint);
		font-style: italic;
	}

	.warn {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--danger);
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

	input,
	select {
		height: 30px;
		padding: 0 9px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		font-family: inherit;
		font-size: 13px;
	}

	.primary,
	.secondary,
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
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.secondary {
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text);
	}
	.secondary:hover {
		background: var(--surface-hover);
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

	.icon {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-faint);
		cursor: pointer;
	}
	.icon:hover {
		background: var(--surface-hover);
		color: var(--danger);
	}

	.rules {
		margin: 10px 0 12px;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}
	.rules li {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 7px 10px;
		background: var(--surface);
		font-size: 12.5px;
	}
	.rules li + li {
		border-top: 1px solid var(--border);
	}
	.rule-attr {
		flex: none;
		color: var(--text-muted);
	}
	.rule-value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text);
	}

	.badge {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px 2px 6px;
		border-radius: 999px;
		background: var(--surface-active);
		color: var(--text-muted);
		font-size: 10.5px;
		font-weight: 600;
		white-space: nowrap;
	}

	.add-rule {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.add-rule input {
		flex: 1 1 130px;
		min-width: 105px;
	}
	.add-rule .attr {
		flex: 1 1 190px;
		max-width: 236px;
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 8px;
		margin-top: 12px;
	}
	.mode {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 11px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		text-align: start;
		cursor: pointer;
		transition: border-color 120ms ease, background-color 120ms ease;
	}
	.mode:hover {
		background: var(--surface-hover);
	}
	.mode.on {
		border-color: var(--brand);
		background: var(--surface-active);
	}
	.mode-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--text);
	}
	.mode-hint {
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--text-faint);
	}

	.quorum {
		display: flex;
		align-items: center;
		gap: 11px;
		margin-top: 12px;
	}
	.quorum input {
		width: 66px;
	}
	.bound {
		font-size: 12px;
		color: var(--text-faint);
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
