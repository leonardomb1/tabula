<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { docHref } from '$lib/nav';
	import { formatDate, relativeTime } from '$lib/time';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const locale = $derived(getLocale());
	const wsId = $derived(page.params.ws ?? '');

	let selected = $state(untrack(() => data.versions[0]?.versionNo) ?? 0);
	const current = $derived(data.versions.find((v) => v.versionNo === selected) ?? null);

	const kindLabel: Record<string, () => string> = {
		edit: m.version_kind_edit,
		restore: m.version_kind_restore,
		delete: m.version_kind_delete
	};
</script>

<svelte:head>
	<title>{m.history_title()} · {data.doc.title}</title>
</svelte:head>

<div class="history">
	<header>
		<a class="back" href={docHref(wsId, data.doc.slug)} aria-label={data.doc.title} title={data.doc.title}>
			<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M15 18l-6-6 6-6" />
			</svg>
		</a>
		<div>
			<h1>{m.history_title()}</h1>
			<p class="doc-name">{data.doc.title}</p>
		</div>
	</header>

	{#if data.versions.length === 0}
		<p class="empty">{m.history_empty()}</p>
	{:else}
		<div class="layout">
			<ol class="versions">
				{#each data.versions as v, i (v.versionNo)}
					<li>
						<button
							type="button"
							class="version"
							class:selected={v.versionNo === selected}
							onclick={() => (selected = v.versionNo)}
						>
							<span class="line">
								<span class="no">{m.version_number({ number: v.versionNo })}</span>
								{#if i === 0}<span class="badge">{m.version_current()}</span>{/if}
								<span class="kind">{(kindLabel[v.kind] ?? m.version_kind_edit)()}</span>
							</span>
							<span class="line sub">
								<span>{relativeTime(v.createdAt, locale)}</span>
								{#if v.editor}<span>· {m.version_by({ editor: v.editor })}</span>{/if}
							</span>
						</button>
					</li>
				{/each}
			</ol>

			{#if current}
				<section class="detail">
					<div class="detail-head">
						<div>
							<h2>{current.title}</h2>
							<p class="when">{formatDate(current.createdAt, locale)}</p>
						</div>
						{#if data.canRestore && current.versionNo !== data.versions[0]?.versionNo}
							<form method="POST" action="?/restore">
								<input type="hidden" name="versionNo" value={current.versionNo} />
								<button class="restore" type="submit">{m.version_restore()}</button>
							</form>
						{/if}
					</div>
					<pre>{current.source}</pre>
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	.history {
		max-width: 1100px;
		margin: 0 auto;
		padding: 32px 32px 64px;
	}

	header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 20px;
	}

	.back {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
	}
	.back:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		line-height: 1.2;
		font-variation-settings: 'opsz' 48;
	}

	.doc-name {
		margin: 1px 0 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}

	.empty {
		color: var(--text-faint);
		font-size: 13.5px;
	}

	.layout {
		display: grid;
		grid-template-columns: 260px 1fr;
		gap: 20px;
		align-items: start;
	}

	.versions {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.version {
		display: block;
		width: 100%;
		padding: 8px 10px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		text-align: start;
		cursor: pointer;
	}
	.version:hover {
		background: var(--surface-hover);
	}
	.version.selected {
		background: var(--surface-active);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.line.sub {
		margin-top: 2px;
		font-size: 11.5px;
		color: var(--text-faint);
	}

	.no {
		font-size: 13px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.kind {
		font-size: 11.5px;
		color: var(--text-muted);
	}

	.badge {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--brand);
		color: #fff;
		font-size: 10px;
		font-weight: 600;
	}

	.detail {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}

	.detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
	}

	h2 {
		margin: 0;
		font-size: 14.5px;
		font-weight: 600;
	}

	.when {
		margin: 2px 0 0;
		font-size: 11.5px;
		color: var(--text-faint);
	}

	.restore {
		padding: 5px 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text-muted);
		font-size: 12.5px;
		cursor: pointer;
		white-space: nowrap;
	}
	.restore:hover {
		border-color: var(--brand);
		color: var(--text);
	}

	pre {
		margin: 0;
		padding: 14px 16px;
		max-height: 60vh;
		overflow: auto;
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}

	@media (max-width: 820px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
