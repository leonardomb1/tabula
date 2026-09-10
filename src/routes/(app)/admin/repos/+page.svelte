<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import { workspaceHref } from '$lib/nav';
	import { label } from '$lib/labels';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let syncing = $state('');
	let confirmDelete = $state('');

	const err = $derived(form && 'error' in form ? String(form.error) : null);
	const errorLabel: Record<string, () => string> = {
		name_required: m.admin_error_name,
		exists: m.admin_error_exists,
		repo_url_required: m.repo_error_url,
		not_repo: () => 'not a repository'
	};
</script>

<svelte:head>
	<title>{m.repos_title()}</title>
</svelte:head>

<div class="page">
	<header>
		<div>
			<h1>
				<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="6" cy="6" r="2.6" />
					<circle cx="6" cy="18" r="2.6" />
					<circle cx="18" cy="8" r="2.6" />
					<path d="M6 8.6v6.8M18 10.6c0 3.4-3 4.4-6 4.4H9" />
				</svg>
				{m.repos_title()}
			</h1>
			<p class="sub">{m.repos_subtitle()}</p>
		</div>
		<a class="back" href="/admin">{m.repos_back_admin()}</a>
	</header>

	{#if err}
		<p class="error">{label(errorLabel, err)}</p>
	{/if}

	<form class="create" method="POST" action="?/create" use:enhance>
		<input name="name" placeholder={m.repos_name_placeholder()} autocomplete="off" required />
		<button type="submit" class="primary">{m.repos_create()}</button>
	</form>

	{#if data.repos.length === 0}
		<p class="none">{m.repos_empty()}</p>
	{/if}

	{#each data.repos as repo (repo.id)}
		<section class="card">
			<div class="card-head">
				<h2>{repo.name}</h2>
				<span class="meta">
					<a href={workspaceHref(repo.id)}>{repo.docCount} {m.repo_files().toLowerCase()}</a>
					{#if repo.repo.lastCommit}
						· <code>{repo.repo.lastCommit.slice(0, 10)}</code>
					{/if}
					{#if repo.repo.lastSyncAt}
						· {new Date(repo.repo.lastSyncAt).toLocaleString()}
					{/if}
				</span>
			</div>

			{#if repo.repo.lastError}
				<p class="error">{repo.repo.lastError}</p>
			{/if}
			{#if form && 'synced' in form && form.synced === repo.id && form.sync}
				<p class="notice">
					{form.sync.unchanged
						? m.repo_sync_unchanged()
						: m.repo_sync_done({
								created: form.sync.created,
								updated: form.sync.updated,
								deleted: form.sync.deleted
							})}
				</p>
			{/if}

			<form class="config" method="POST" action="?/save" use:enhance>
				<input type="hidden" name="ws" value={repo.id} />
				<label>
					<span>{m.repo_url()}</span>
					<input name="url" value={repo.repo.url} placeholder="https://gitlab.example.com/group/project.git" autocomplete="off" required />
				</label>
				<div class="row2">
					<label>
						<span>{m.repo_branch()}</span>
						<input name="branch" value={repo.repo.branch} autocomplete="off" />
					</label>
					<label>
						<span>{m.repo_username()}</span>
						<input name="username" value={repo.repo.username} placeholder="oauth2" autocomplete="off" />
					</label>
				</div>
				<label>
					<span>{m.repo_token()}{#if repo.repo.hasToken}<em>{m.repo_token_set()}</em>{/if}</span>
					<input name="token" type="password" placeholder={repo.repo.hasToken ? '••••••••' : ''} autocomplete="new-password" />
				</label>
				<label>
					<span>{m.repo_include()}</span>
					<input name="include" value={repo.repo.include} placeholder="src/, docs/" autocomplete="off" />
				</label>
				<div class="actions">
					<button type="submit" class="secondary">{m.repo_save()}</button>
				</div>
			</form>

			<div class="hook">
				{#if repo.repo.webhookUrl}
					<span class="hook-label">{m.repo_webhook()}</span>
					<code class="hook-url">{repo.repo.webhookUrl}</code>
					<button type="button" class="ghost" onclick={() => navigator.clipboard.writeText(repo.repo.webhookUrl ?? '')}>
						{m.repo_webhook_copy()}
					</button>
					<form method="POST" action="?/hookRotate" use:enhance>
						<input type="hidden" name="ws" value={repo.id} />
						<button type="submit" class="ghost">{m.repo_webhook_rotate()}</button>
					</form>
					<form method="POST" action="?/hookDisable" use:enhance>
						<input type="hidden" name="ws" value={repo.id} />
						<button type="submit" class="ghost danger">{m.repo_webhook_disable()}</button>
					</form>
				{:else}
					<span class="hook-label">{m.repo_webhook()}</span>
					<span class="hook-off">{m.repo_webhook_off()}</span>
					<form method="POST" action="?/hookRotate" use:enhance>
						<input type="hidden" name="ws" value={repo.id} />
						<button type="submit" class="ghost">{m.repo_webhook_enable()}</button>
					</form>
				{/if}
			</div>

			<div class="foot">
				<form
					method="POST"
					action="?/sync"
					use:enhance={() => {
						syncing = repo.id;
						return async ({ update }) => {
							await update();
							syncing = '';
						};
					}}
				>
					<input type="hidden" name="ws" value={repo.id} />
					<button type="submit" class="secondary" disabled={syncing === repo.id || !repo.repo.url}>
						{syncing === repo.id ? m.repo_syncing() : m.repo_sync_now()}
					</button>
				</form>
				{#if repo.repo.skipped}
					{@const s = repo.repo.skipped}
					{@const total = s.dotfile + s.excluded + s.oversized + s.binary}
					{#if total > 0}
						<span class="skipped">
							{m.repo_skipped()}: {total}
							({m.repo_skipped_detail({ dotfile: s.dotfile, excluded: s.excluded, oversized: s.oversized, binary: s.binary })})
						</span>
					{/if}
				{/if}
				<span class="spacer"></span>
				{#if confirmDelete === repo.id}
					<form method="POST" action="?/remove" use:enhance>
						<input type="hidden" name="ws" value={repo.id} />
						<button type="submit" class="destructive">{m.repos_delete_confirm()}</button>
					</form>
					<button type="button" class="ghost" onclick={() => (confirmDelete = '')}>{m.admin_cancel()}</button>
				{:else}
					<button type="button" class="ghost danger" onclick={() => (confirmDelete = repo.id)}>
						{m.repos_delete()}
					</button>
				{/if}
			</div>
		</section>
	{/each}

	<p class="hint">{m.repo_readonly_note()}</p>
</div>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 40px 32px 80px;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: -0.015em;
	}
	.sub {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--text-muted);
	}
	.back {
		flex: none;
		margin-top: 6px;
		font-size: 13px;
		color: var(--text-muted);
	}
	.back:hover {
		color: var(--text);
	}

	.error {
		margin: 10px 0;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 13px;
	}
	.notice {
		margin: 10px 0;
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface-active);
		font-size: 13px;
	}

	.create {
		display: flex;
		gap: 8px;
		margin-bottom: 22px;
	}
	.create input {
		flex: 1;
		height: 34px;
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 13.5px;
	}

	.none {
		font-size: 13px;
		color: var(--text-faint);
		font-style: italic;
	}

	.card {
		margin-bottom: 20px;
		padding: 16px 18px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}
	.card-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.card-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.meta {
		font-size: 12px;
		color: var(--text-faint);
	}
	.meta a {
		color: var(--text-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.meta code {
		font-family: var(--font-mono);
	}

	.config {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.config label {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.config label span {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.config label em {
		margin-inline-start: 6px;
		font-style: normal;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-muted);
	}
	.config input {
		height: 30px;
		padding: 0 9px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 13px;
	}
	.actions {
		margin-top: 2px;
	}

	.hook {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px 10px;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	.hook-label {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.hook-url {
		flex: 1;
		min-width: 200px;
		overflow-x: auto;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-muted);
	}
	.hook-off {
		font-size: 12px;
		color: var(--text-faint);
	}

	.foot {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
	.skipped {
		font-size: 11.5px;
		color: var(--text-faint);
	}
	.spacer {
		flex: 1;
	}

	.primary,
	.secondary,
	.destructive,
	.ghost {
		height: 32px;
		padding: 0 13px;
		border-radius: var(--radius-sm);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.primary {
		border: 0;
		background: var(--brand);
		color: #fff;
	}
	.secondary {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
	}
	.secondary:hover {
		border-color: var(--border-strong);
	}
	.secondary:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.destructive {
		border: 1px solid var(--danger);
		background: var(--danger-wash);
		color: var(--danger);
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
	.ghost.danger:hover {
		color: var(--danger);
	}

	.hint {
		margin-top: 8px;
		font-size: 12px;
		color: var(--text-faint);
	}
</style>
