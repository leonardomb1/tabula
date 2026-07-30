<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { docHref, newDocHref, toggleTag, workspaceHref } from '$lib/nav';
	import { relativeTime } from '$lib/time';
	import type { DocsPage, SortMode } from '$lib/docs';

	let {
		workspace,
		page,
		activeTags,
		sort,
		canWrite = false
	}: {
		workspace: { id: string; name: string };
		page: DocsPage;
		activeTags: string[];
		sort: SortMode;
		canWrite?: boolean;
	} = $props();

	const locale = $derived(getLocale());
</script>

<div class="index">
	<header class="head">
		<div class="titles">
			<h1>{workspace.name}</h1>
			<p class="count">{m.docs_count({ count: page.total })}</p>
		</div>

		<div class="tools">
			{#if activeTags.length > 0}
				<a class="clear" href={workspaceHref(workspace.id, { sort })}>{m.filters_clear()}</a>
			{/if}
			<div class="seg" role="group" aria-label={m.sort_label()}>
				<a
					class:selected={sort === 'recent'}
					href={workspaceHref(workspace.id, { tags: activeTags, sort: 'recent' })}
				>
					{m.sort_recent()}
				</a>
				<a
					class:selected={sort === 'alpha'}
					href={workspaceHref(workspace.id, { tags: activeTags, sort: 'alpha' })}
				>
					{m.sort_alpha()}
				</a>
			</div>
			{#if canWrite}
				<a class="new" href={newDocHref(workspace.id)}>
					<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
						<path d="M12 5v14M5 12h14" />
					</svg>
					{m.doc_new()}
				</a>
			{/if}
		</div>
	</header>

	{#if activeTags.length > 0}
		<div class="active-tags">
			{#each activeTags as tag (tag)}
				<a class="chip on" href={workspaceHref(workspace.id, { tags: toggleTag(activeTags, tag), sort })}>
					#{tag}
					<span aria-hidden="true">×</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if page.docs.length === 0}
		<p class="empty">{activeTags.length > 0 ? m.docs_empty_filtered() : m.docs_empty()}</p>
	{:else}
		<ul class="rows">
			{#each page.docs as doc (doc.id)}
				<li>
					<a class="row" href={docHref(workspace.id, doc.slug)}>
						<span class="mode" class:typst={doc.mode === 'typst'} aria-hidden="true"></span>
						<span class="title">{doc.title || m.doc_untitled()}</span>
						<span class="tags">
							{#each doc.tags.slice(0, 3) as tag (tag)}
								<span class="chip">{tag}</span>
							{/each}
						</span>
						<time class="when" datetime={new Date(doc.updatedAt).toISOString()}>
							{relativeTime(doc.updatedAt, locale)}
						</time>
					</a>
				</li>
			{/each}
		</ul>

		{#if page.hasMore}
			<a
				class="more"
				data-sveltekit-noscroll
				href={workspaceHref(workspace.id, {
					tags: activeTags,
					sort,
					limit: page.limit + 40
				})}
			>
				{m.load_more()}
			</a>
		{/if}
	{/if}
</div>

<style>
	.index {
		max-width: 900px;
		margin: 0 auto;
		padding: 28px 32px 64px;
	}

	.head {
		display: flex;
		align-items: flex-end;
		gap: 16px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--border);
	}

	.titles {
		flex: 1;
		min-width: 0;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 600;
		letter-spacing: -0.015em;
		font-variation-settings: 'opsz' 48;
		line-height: 1.15;
	}

	.count {
		margin: 3px 0 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.clear {
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.clear:hover {
		color: var(--text);
	}

	.seg {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border: 1px solid var(--border);
	}
	.seg a {
		padding: 3px 10px;
		border-radius: 4px;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.seg a:hover {
		color: var(--text);
	}
	.seg a.selected {
		background: var(--surface-active);
		color: var(--text);
	}

	.new {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 28px;
		padding: 0 11px 0 9px;
		border-radius: var(--radius-sm);
		background: var(--brand);
		color: #fff;
		font-size: 12.5px;
		font-weight: 600;
		white-space: nowrap;
	}
	.new:hover {
		filter: brightness(1.08);
	}

	.active-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 12px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
		font-size: 11px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.chip.on {
		border-color: transparent;
		background: var(--brand);
		color: #fff;
	}

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 10px;
		margin-inline: -10px;
		border-radius: var(--radius-sm);
		border-bottom: 1px solid var(--border);
	}
	.row:hover {
		background: var(--surface-hover);
	}

	.mode {
		width: 5px;
		height: 5px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--text-faint);
	}
	.mode.typst {
		background: var(--brand);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14.5px;
		font-weight: 500;
	}

	.tags {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.when {
		flex-shrink: 0;
		min-width: 7ch;
		text-align: end;
		white-space: nowrap;
		font-size: 12px;
		color: var(--text-faint);
		font-variant-numeric: tabular-nums;
	}

	.empty {
		margin: 32px 0;
		color: var(--text-faint);
		font-size: 13.5px;
	}

	.more {
		display: block;
		margin-top: 16px;
		padding: 8px;
		text-align: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: 13px;
		color: var(--text-muted);
	}
	.more:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	@media (max-width: 720px) {
		.index {
			padding: 20px 16px 48px;
		}
		.tags {
			display: none;
		}
	}
</style>
