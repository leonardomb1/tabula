<script lang="ts">
	/**
	 * Administration: create workspaces, set who gets in, and configure the rules that
	 * apply inside each one.
	 */
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import PolicyEditor from '$lib/components/PolicyEditor.svelte';
	import { attributeLabel, label, roleLabel } from '$lib/labels';
	import { policyIsActive } from '$lib/policy';
	import { matchesSelector, type Selector } from '$lib/rbac';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Section = 'general' | 'access' | 'policy' | 'review';
	const section = $derived(data.section);
	let creating = $state(false);
	let confirmDeleteId = $state('');

	const err = $derived(form && 'error' in form ? String(form.error) : null);
	const justSaved = $derived(Boolean(form && 'saved' in form));

	const errorLabel: Record<string, () => string> = {
		invalid_id: m.admin_error_invalid_id,
		exists: m.admin_error_exists,
		name_required: m.admin_error_name,
		quorum: m.admin_quorum_deadlock
	};

	const sections: { id: Section; label: () => string }[] = [
		{ id: 'general', label: m.admin_section_general },
		{ id: 'access', label: m.admin_section_access },
		{ id: 'policy', label: m.admin_section_policy },
		{ id: 'review', label: m.admin_section_review }
	];

	function matchesYou(sel: Selector): boolean {
		return matchesSelector(sel, data.you.claims);
	}

	function link(ws: string, to: Section): string {
		return `/admin?ws=${encodeURIComponent(ws)}&section=${to}`;
	}
</script>

<svelte:head>
	<title>{m.admin_title()}</title>
</svelte:head>

<div class="page">
	<header>
		<div>
			<h1>{m.admin_title()}</h1>
			<p class="sub">{m.admin_subtitle()}</p>
		</div>
		{#if data.isPlatformAdmin}
			<div class="header-actions">
				<a class="secondary" href="/admin/platform">{m.admin_platform()}</a>
				<button type="button" class="primary" onclick={() => (creating = !creating)}>
					{m.admin_new_workspace()}
				</button>
			</div>
		{/if}
	</header>

	{#if creating}
		<form class="create" method="POST" action="?/create">
			<div class="field">
				<label for="ws-id">{m.admin_ws_id()}</label>
				<input id="ws-id" name="id" placeholder="engenharia" autocomplete="off" required />
			</div>
			<div class="field grow">
				<label for="ws-name">{m.admin_ws_name()}</label>
				<input id="ws-name" name="name" placeholder="Engenharia" autocomplete="off" required />
			</div>
			<button type="submit" class="primary">{m.admin_create()}</button>
			<button type="button" class="ghost" onclick={() => (creating = false)}>
				{m.admin_cancel()}
			</button>
			<p class="field-hint">{m.admin_ws_id_hint()}</p>
		</form>
	{/if}

	{#if err}
		<p class="error">{label(errorLabel, err)}</p>
	{/if}

	<div class="split">
		<nav class="list" aria-label={m.admin_nav()}>
			{#if data.workspaces.length === 0}
				<p class="empty">{m.admin_empty()}</p>
			{:else}
				{#each data.workspaces as ws (ws.id)}
					<a class="ws" class:active={ws.id === data.current?.id} href={link(ws.id, section)}>
						<span class="dot" class:on={policyIsActive(ws.policy)}></span>
						<span class="ws-text">
							<span class="ws-name">{ws.name}</span>
							<code>{ws.id}</code>
						</span>
					</a>
				{/each}
			{/if}
		</nav>

		{#if data.current}
			{@const cur = data.current}
			<section class="detail">
				<nav class="tabs">
					{#each sections as s (s.id)}
						<a
							href={link(cur.id, s.id)}
							class:on={section === s.id}
							aria-current={section === s.id ? 'page' : undefined}
						>
							{s.label()}
						</a>
					{/each}
				</nav>

				{#if section === 'general'}
					<form class="block" method="POST" action="?/rename" use:enhance>
						<input type="hidden" name="ws" value={cur.id} />
						<h2>{m.admin_section_general()}</h2>
						<div class="field">
							<label for="rename">{m.admin_ws_name()}</label>
							<div class="inline">
								<input id="rename" name="name" value={cur.name} autocomplete="off" required />
								<button type="submit" class="secondary">{m.admin_rename()}</button>
							</div>
						</div>
						<dl class="facts">
							<dt>{m.admin_ws_id()}</dt>
							<dd><code>{cur.id}</code></dd>
							<dt>{m.admin_ws_kind()}</dt>
							<dd>{cur.kind === 'system' ? m.admin_kind_system() : m.admin_kind_team()}</dd>
						</dl>
					</form>

					{#if data.isPlatformAdmin && cur.deletable}
						<div class="block danger">
							<h2>{m.admin_danger()}</h2>
							<p class="hint">{m.admin_delete_ws_hint()}</p>
							{#if confirmDeleteId === cur.id}
								<form method="POST" action="?/remove" class="inline">
									<input type="hidden" name="ws" value={cur.id} />
									<button type="submit" class="destructive">{m.admin_delete_confirm()}</button>
									<button type="button" class="ghost" onclick={() => (confirmDeleteId = '')}>
										{m.admin_cancel()}
									</button>
								</form>
							{:else}
								<button
									type="button"
									class="secondary"
									onclick={() => (confirmDeleteId = cur.id)}
								>
									{m.admin_delete_ws()}
								</button>
							{/if}
						</div>
					{/if}
				{/if}

				{#if section === 'access'}
					<div class="block">
						<h2>{m.admin_access_title()}</h2>
						<p class="hint">{m.admin_access_hint()}</p>

						{#if cur.bindings.length === 0}
							<p class="none">{m.admin_access_empty()}</p>
						{:else}
							<ul class="rules">
								{#each cur.bindings as b (b.id)}
									<li>
										<span class="rule-attr">{attributeLabel(b.attribute)}</span>
										<code class="rule-value">{b.value}</code>
										{#if matchesYou(b)}
											<span class="badge">
												<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
													<path d="m5 12.5 4.5 4.5L19 7" />
												</svg>
												{m.admin_matches_you()}
											</span>
										{/if}
										<span class="rule-role">{label(roleLabel, b.role)}</span>
										{#if data.isPlatformAdmin}
											<form method="POST" action="?/removeBinding" use:enhance>
												<input type="hidden" name="ws" value={cur.id} />
												<input type="hidden" name="id" value={b.id} />
												<button type="submit" class="icon" aria-label={m.admin_remove_rule()}>
													<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
														<path d="M6 6l12 12M18 6L6 18" />
													</svg>
												</button>
											</form>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}

						{#if data.isPlatformAdmin}
							<form class="add-rule" method="POST" action="?/addBinding" use:enhance>
								<input type="hidden" name="ws" value={cur.id} />
								<select name="attribute" class="attr" aria-label={m.admin_attribute()}>
									<button><selectedcontent></selectedcontent></button>
									{#each data.attributes as a (a.key)}
										<option value={a.key}>{attributeLabel(a.key)}</option>
									{/each}
								</select>
								<input name="value" placeholder={m.admin_value()} autocomplete="off" />
								<select name="role" class="role" aria-label={m.admin_role()}>
									<button><selectedcontent></selectedcontent></button>
									<option value="viewer">{m.role_viewer()}</option>
									<option value="editor" selected>{m.role_editor()}</option>
									<option value="maintainer">{m.role_maintainer()}</option>
								</select>
								<button type="submit" class="secondary">{m.admin_add_rule()}</button>
							</form>
						{:else}
							<p class="none">{m.admin_access_central()}</p>
						{/if}
					</div>
				{/if}

				{#key cur.id}
					<PolicyEditor
						wsId={cur.id}
						policy={cur.policy}
						bindings={cur.bindings}
						claims={data.you.claims}
						attributes={data.attributes}
						{section}
						saved={justSaved}
					/>
				{/key}
			</section>
		{/if}
	</div>
</div>

<style>
	.page {
		max-width: 1080px;
		margin: 0 auto;
		padding: 28px 32px 96px;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--border);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		font-variation-settings: 'opsz' 48;
	}

	.sub {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--text-muted);
		max-width: 56ch;
	}

	h2 {
		margin: 0 0 2px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.hint,
	.field-hint {
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

	.error {
		margin: 14px 0 0;
		padding: 8px 11px;
		border: 1px solid var(--danger);
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 12.5px;
	}

	.create {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 10px;
		margin-top: 16px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.create .field-hint {
		flex-basis: 100%;
		margin: 0;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.field.grow {
		flex: 1;
	}
	.field label {
		font-size: 11.5px;
		color: var(--text-faint);
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

	.inline {
		display: flex;
		gap: 8px;
	}
	.inline input {
		flex: 1;
		min-width: 0;
	}

	.primary,
	.secondary,
	.ghost,
	.destructive {
		flex: none;
		height: 30px;
		padding: 0 13px;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
	}
	.primary {
		border: 0;
		background: var(--brand);
		color: #fff;
	}
	.header-actions {
		display: flex;
		gap: 8px;
	}
	a.secondary {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
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
	.destructive {
		border: 1px solid var(--danger);
		background: var(--danger-wash);
		color: var(--danger);
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

	.split {
		display: grid;
		grid-template-columns: 232px minmax(0, 1fr);
		gap: 26px;
		margin-top: 20px;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		align-self: start;
		position: sticky;
		top: 0;
	}

	.empty {
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.ws {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 9px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		text-decoration: none;
		transition: background-color 120ms ease, color 120ms ease;
	}
	.ws:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.ws.active {
		background: var(--surface-active);
		color: var(--text);
	}

	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--border-strong);
	}
	.dot.on {
		background: var(--brand);
	}

	.ws-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.ws-name {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ws-text code {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--text-faint);
	}

	.tabs {
		display: flex;
		gap: 2px;
		margin-bottom: 18px;
		border-bottom: 1px solid var(--border);
	}
	.tabs a {
		padding: 7px 11px;
		border-bottom: 2px solid transparent;
		color: var(--text-faint);
		font-size: 13px;
		text-decoration: none;
		transition: color 120ms ease, border-color 120ms ease;
	}
	.tabs a:hover {
		color: var(--text-muted);
	}
	.tabs a.on {
		color: var(--text);
		border-bottom-color: var(--brand);
	}

	.block {
		padding: 16px 0;
		border-bottom: 1px solid var(--border);
	}
	.block.danger h2 {
		color: var(--danger);
	}

	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 16px;
		margin: 14px 0 0;
		font-size: 12.5px;
	}
	.facts dt {
		color: var(--text-faint);
	}
	.facts dd {
		margin: 0;
		color: var(--text-muted);
	}
	.facts code {
		font-family: var(--font-mono);
		font-size: 12px;
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
	.rule-role {
		flex: none;
		padding: 1px 7px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		font-size: 11px;
		color: var(--text-muted);
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
	.add-rule .role {
		flex: 0 0 128px;
	}

	@media (max-width: 860px) {
		.split {
			grid-template-columns: 1fr;
		}
		.list {
			position: static;
			flex-direction: row;
			overflow-x: auto;
		}
	}
</style>
