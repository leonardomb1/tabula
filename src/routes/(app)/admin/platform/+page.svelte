<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmDelete = $state<string | null>(null);

	const attrLabel: Record<string, () => string> = {
		user: m.attr_user,
		ad_group: m.attr_ad_group,
		ad_group_prefix: m.attr_ad_group_prefix,
		cost_center: m.attr_cost_center,
		cost_center_prefix: m.attr_cost_center_prefix,
		'*': m.attr_wildcard
	};

	function label(map: Record<string, () => string>, key: string): string {
		return map[key]?.() ?? key;
	}

	function seen(iso: string | null): string {
		return iso ? new Date(iso).toLocaleDateString() : '—';
	}
</script>

<svelte:head>
	<title>{m.admin_platform()}</title>
</svelte:head>

<div class="page">
	<header>
		<div>
			<h1>{m.admin_platform()}</h1>
			<p class="sub">{m.admin_platform_subtitle()}</p>
		</div>
		<a class="ghost" href="/admin">{m.admin_title()}</a>
	</header>

	<div class="block">
		<h2>{m.admin_gate_title()}</h2>
		<p class="hint">{m.admin_gate_hint()}</p>

		{#if data.rules.length === 0}
			<p class="none">{m.admin_gate_empty()}</p>
		{:else}
			<ul class="rules">
				{#each data.rules as r (r.id)}
					<li>
						<span class="rule-attr">{label(attrLabel, r.attribute)}</span>
						<code class="rule-value">{r.value}</code>
						<form method="POST" action="?/removeRule" use:enhance>
							<input type="hidden" name="id" value={r.id} />
							<button type="submit" class="icon" aria-label={m.admin_remove_rule()}>
								<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
									<path d="M6 6l12 12M18 6L6 18" />
								</svg>
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		<form class="add-rule" method="POST" action="?/addRule" use:enhance>
			<select name="attribute" class="attr" aria-label={m.admin_attribute()}>
				<button><selectedcontent></selectedcontent></button>
				{#each data.attributes as a (a.key)}
					<option value={a.key}>{label(attrLabel, a.key)}</option>
				{/each}
			</select>
			<input name="value" placeholder={m.admin_value()} autocomplete="off" />
			<button type="submit" class="secondary">{m.admin_add_rule()}</button>
		</form>
	</div>

	<div class="block">
		<h2>{m.admin_public_title()}</h2>
		<p class="hint">{m.admin_public_hint()}</p>

		{#if data.published.length === 0}
			<p class="none">{m.admin_public_empty()}</p>
		{:else}
			<ul class="rules">
				{#each data.published as d (d.id)}
					<li>
						<a class="doc-link" href={`/wiki/${encodeURIComponent(d.publicSlug)}`}>{d.title}</a>
						<code class="rule-value">{d.workspaceId}</code>
						<span class="views">{d.views} {m.wiki_views()}</span>
						<form method="POST" action="?/unpublish" use:enhance>
							<input type="hidden" name="doc" value={d.id} />
							<button type="submit" class="secondary">{m.admin_unpublish()}</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if data.reviews.length > 0}
			<h2 class="sub-h">{m.admin_reviews_title()}</h2>
			<ul class="rules">
				{#each data.reviews as r (r.id)}
					<li>
						<a class="doc-link" href={`/w/${encodeURIComponent(r.workspaceId)}/${encodeURIComponent(r.docSlug)}`}>{r.docTitle}</a>
						<code class="rule-value">{r.workspaceId}</code>
						<span class="views">{r.kind}{r.kind === 'publish' ? ` · ${r.approvals}/${r.quorum}` : ''} · {r.requestedBy}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="block">
		<h2>{m.admin_users_title()}</h2>
		<p class="hint">{m.admin_users_hint()}</p>

		{#if data.users.length === 0}
			<p class="none">{m.admin_users_empty()}</p>
		{:else}
			<ul class="users">
				{#each data.users as u (u.username)}
					<li class:blocked={u.blocked}>
						<span class="who">
							<span class="name">
								{u.name}
								{#if u.isPlatformAdmin}<span class="badge gold">{m.role_platform_admin()}</span>{/if}
								{#if u.blocked}<span class="badge danger">{m.admin_user_blocked()}</span>{/if}
							</span>
							<span class="meta">
								<code>{u.username}</code>
								{#if u.title}· {u.title}{/if}
								{#if u.mail}· {u.mail}{/if}
								· {seen(u.lastSeenAt)}
							</span>
						</span>
						{#if u.username !== data.you && !u.isPlatformAdmin}
							<span class="row-actions">
								{#if u.blocked}
									<form method="POST" action="?/unblock" use:enhance>
										<input type="hidden" name="username" value={u.username} />
										<button type="submit" class="secondary">{m.admin_user_unblock()}</button>
									</form>
								{:else}
									<form method="POST" action="?/block" use:enhance>
										<input type="hidden" name="username" value={u.username} />
										<button type="submit" class="secondary">{m.admin_user_block()}</button>
									</form>
								{/if}
								{#if confirmDelete === u.username}
									<form method="POST" action="?/deleteUser" use:enhance>
										<input type="hidden" name="username" value={u.username} />
										<button type="submit" class="destructive">{m.admin_delete_confirm()}</button>
									</form>
									<button type="button" class="ghost" onclick={() => (confirmDelete = null)}>
										{m.admin_cancel()}
									</button>
								{:else}
									<button type="button" class="destructive" onclick={() => (confirmDelete = u.username)}>
										{m.admin_user_delete()}
									</button>
								{/if}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="field-hint">{m.admin_user_delete_confirm()}</p>
		{/if}
	</div>
</div>

<style>
	.page {
		max-width: 880px;
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

	.block {
		margin-top: 26px;
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

	.rules,
	.users {
		margin: 0 0 10px;
		padding: 0;
		list-style: none;
	}

	.rules li,
	.users li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
	}

	.rule-attr {
		color: var(--text-muted);
	}

	.doc-link {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		text-decoration: none;
		font-weight: 500;
	}
	.doc-link:hover {
		color: var(--brand);
	}
	.views {
		flex-shrink: 0;
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.sub-h {
		margin-top: 18px;
	}

	.rule-value {
		font-size: 12px;
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		background: var(--surface);
	}

	.users li.blocked .who {
		opacity: 0.6;
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: 1px;
		flex: 1;
		min-width: 0;
	}

	.name {
		display: flex;
		align-items: center;
		gap: 7px;
		font-weight: 500;
	}

	.meta {
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.meta code {
		font-size: 11px;
	}

	.badge {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
	}
	.badge.gold {
		color: var(--brand);
		border-color: var(--brand);
	}
	.badge.danger {
		color: var(--danger);
		border-color: var(--danger);
	}

	.row-actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.add-rule {
		display: flex;
		gap: 8px;
	}
	.add-rule input {
		flex: 1;
		min-width: 0;
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

	.secondary,
	.ghost,
	.destructive {
		flex: none;
		height: 26px;
		padding: 0 11px;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
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
		display: inline-flex;
		align-items: center;
		border: 0;
		background: none;
		color: var(--text-muted);
		font-weight: 500;
		text-decoration: none;
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
</style>
