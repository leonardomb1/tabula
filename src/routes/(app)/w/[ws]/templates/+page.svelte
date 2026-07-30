<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { relativeTime } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const locale = $derived(getLocale());
	const ws = $derived(page.params.ws ?? '');
	let creating = $state(false);
</script>

<svelte:head>
	<title>{m.templates_title()}</title>
</svelte:head>

<div class="page">
	<header>
		<div>
			<h1>{m.templates_title()}</h1>
			<p class="body">{m.templates_body()}</p>
		</div>
		<button type="button" class="new" onclick={() => (creating = !creating)}>
			{m.template_new()}
		</button>
	</header>

	{#if creating}
		<form class="create" method="POST" action="?/create">
			<input name="name" placeholder={m.template_name()} autocomplete="off" required />
			<button type="submit">{m.doc_create()}</button>
		</form>
	{/if}

	{#if data.templates.length === 0}
		<p class="empty">{m.templates_empty()}</p>
	{:else}
		<ul class="list">
			{#each data.templates as t (t.slug)}
				<li>
					<a class="row" href="/w/{ws}/templates/{t.slug}">
						<span class="name">{t.name}</span>
						<code class="slug">{t.slug}</code>
						<time>{relativeTime(t.updatedAt, locale)}</time>
					</a>
				</li>
			{/each}
		</ul>
		<p class="hint">{m.template_used_by_frontmatter({ slug: data.templates[0].slug })}</p>
	{/if}
</div>

<style>
	.page {
		max-width: 820px;
		margin: 0 auto;
		padding: 28px 32px 64px;
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

	.body {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--text-muted);
		max-width: 52ch;
	}

	.new {
		flex: none;
		height: 30px;
		padding: 0 13px;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--brand);
		color: #fff;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}

	.create {
		display: flex;
		gap: 8px;
		margin-top: 16px;
	}
	.create input {
		flex: 1;
		height: 32px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		font-size: 13px;
	}
	.create button {
		height: 32px;
		padding: 0 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		font-size: 13px;
		cursor: pointer;
	}

	.list {
		margin: 16px 0 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 10px;
		margin-inline: -10px;
		border-bottom: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}
	.row:hover {
		background: var(--surface-hover);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.slug {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--text-faint);
	}

	time {
		flex: none;
		font-size: 12px;
		color: var(--text-faint);
	}

	.empty,
	.hint {
		margin-top: 20px;
		font-size: 13px;
		color: var(--text-faint);
	}
</style>
