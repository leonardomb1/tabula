<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { getLocale } from '$lib/paraglide/runtime';
	import { docHref, editHref, historyHref, workspaceHref } from '$lib/nav';
	import ExportDialog from '$lib/components/ExportDialog.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import { formatDate } from '$lib/time';
	import { countView } from '$lib/view-count';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const locale = $derived(getLocale());
	const wsId = $derived(page.params.ws ?? '');

	// Counted from the browser: link hover preloads the server load, so counting
	// there would score documents nobody opened.
	$effect(() => {
		countView(data.doc.id, 'app');
	});

	let exportOpen = $state(false);
	let publishOpen = $state(false);
	let copied = $state(false);

	const publicUrl = $derived(
		data.doc.publicSlug ? `/wiki/${encodeURIComponent(data.doc.publicSlug)}` : ''
	);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(location.origin + publicUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			/* clipboard unavailable */
		}
	}

	function exportHref(slug?: string, options: Record<string, string> = {}): string {
		const base = resolve('/api/export/[id]', { id: data.doc.id });
		const params = new URLSearchParams();
		if (slug) params.set('template', slug);
		for (const [key, value] of Object.entries(options)) {
			if (value !== '') params.set(`opt.${key}`, value);
		}
		const qs = params.toString();
		return qs ? `${base}?${qs}` : base;
	}
</script>

<svelte:head>
	<title>{data.doc.title || m.doc_untitled()}</title>
</svelte:head>

<article class="doc">
	<header>
		<div class="top">
			<h1>
				{data.doc.title || m.doc_untitled()}
				{#if data.doc.isPublic && data.doc.publicSlug}
					<a class="state public" href={`/wiki/${encodeURIComponent(data.doc.publicSlug)}`}>
						{m.doc_public_badge()}
					</a>
				{:else if data.pendingPublish}
					<span class="state pending">{m.doc_pending_badge()}</span>
				{/if}
			</h1>
			<div class="doc-actions">
				<a href={historyHref(wsId, data.doc.slug)}>{m.doc_history()}</a>
				{#if data.canPublish || data.pendingPublish?.canApprove}
					<button type="button" class="publish-btn" onclick={() => (publishOpen = true)}>
						{m.publish_button()}
					</button>
				{/if}
				{#if data.canWrite}
					<a class="edit" href={editHref(wsId, data.doc.slug)}>{m.doc_edit()}</a>
				{/if}
			</div>
		</div>
		<p class="meta">
			<span>{m.doc_updated({ when: formatDate(data.doc.updatedAt, locale) })}</span>
			{#if data.doc.updatedBy}
				<span class="sep">·</span>
				<PersonCard person={data.doc.updatedBy} />
			{/if}
			<span class="sep">·</span>
			<a
				class="pdf"
				href={exportHref(data.defaultTemplate || undefined)}
				target="_blank"
				rel="noopener"
				aria-label={m.doc_export_pdf()}
				title={m.doc_export_pdf()}
				onclick={(e) => {
					if (data.templates.length === 0) return;
					e.preventDefault();
					exportOpen = true;
				}}
			>
				<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
					<path d="M14 3v5h5" />
					<path d="M8.5 17v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M13 17v-4h1a1.6 1.6 0 0 1 0 4zM17.5 13H16v4M16 15h1.3" />
				</svg>
			</a>
		</p>
		{#if data.doc.tags.length > 0}
			<p class="tags">
				{#each data.doc.tags as tag (tag)}
					<a class="chip" href={workspaceHref(wsId, { tags: [tag] })}>#{tag}</a>
				{/each}
			</p>
		{/if}
	</header>

	{#if data.renderError}
		<p class="render-error">{data.renderError}</p>
	{:else if !data.html.trim()}
		<p class="empty">{m.reader_empty()}</p>
	{:else if data.doc.mode === 'typst'}
		<div class="typst-body">{@html data.html}</div>
	{:else}
		<div class="prose">{@html data.html}</div>
	{/if}

	{#if data.backlinks.length > 0}
		<footer class="backlinks">
			<h2>{m.doc_backlinks()}</h2>
			<ul>
				{#each data.backlinks as link (link.id)}
					<li><a href={docHref(wsId, link.slug)}>{link.title || m.doc_untitled()}</a></li>
				{/each}
			</ul>
		</footer>
	{/if}
</article>

<ExportDialog
	bind:open={exportOpen}
	templates={data.templates}
	defaultTemplate={data.defaultTemplate}
	frontmatter={data.doc.frontmatter}
	{exportHref}
/>

{#if publishOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="pub-overlay" onclick={() => (publishOpen = false)}></div>
	<div class="pub-panel" role="dialog" aria-modal="true" aria-label={m.publish_heading()}>
		<header class="pub-head">
			<h2>{m.publish_heading()}</h2>
			<button type="button" class="pub-close" onclick={() => (publishOpen = false)} aria-label={m.publish_close()}>×</button>
		</header>

		{#if data.doc.isPublic && data.doc.publicSlug}
			<p class="pub-state"><span class="dot live"></span>{m.publish_state_public()}</p>
			<div class="pub-link">
				<a href={publicUrl} target="_blank" rel="noopener">{m.publish_view()}</a>
				<button type="button" onclick={copyLink}>{copied ? m.publish_copied() : m.publish_copy()}</button>
			</div>
			{#if data.canPublish}
				<form method="POST" action="?/unpublish" use:enhance={() => async ({ update }) => { await update(); publishOpen = false; }}>
					<button type="submit" class="pub-btn danger">{m.publish_undo()}</button>
				</form>
			{/if}
		{:else if data.pendingPublish}
			<p class="pub-state"><span class="dot pending"></span>{m.publish_state_pending()}</p>
			<p class="pub-sub">{m.publish_requested_by({ who: data.pendingPublish.requestedBy })}</p>
			{#if data.pendingPublish.canApprove}
				<form method="POST" action="?/approve" use:enhance={() => async ({ update }) => { await update(); publishOpen = false; }}>
					<button type="submit" class="pub-btn primary">{m.publish_approve()}</button>
				</form>
				<form method="POST" action="?/reject" use:enhance={() => async ({ update }) => { await update(); publishOpen = false; }}>
					<button type="submit" class="pub-btn">{m.publish_reject()}</button>
				</form>
			{:else if data.canPublish}
				<form method="POST" action="?/unpublish" use:enhance={() => async ({ update }) => { await update(); publishOpen = false; }}>
					<button type="submit" class="pub-btn">{m.publish_cancel()}</button>
				</form>
			{/if}
		{:else}
			<p class="pub-state"><span class="dot"></span>{m.publish_state_private()}</p>
			<p class="pub-sub">{m.publish_hint_private()}</p>
			{#if data.canPublish}
				<form method="POST" action="?/publish" use:enhance={() => async ({ update }) => { await update(); publishOpen = false; }}>
					<button type="submit" class="pub-btn primary">{m.publish_do()}</button>
				</form>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.publish-btn {
		font-family: inherit;
		font-size: 12.5px;
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--brand);
		font-weight: 500;
		cursor: pointer;
		transition: background-color 120ms ease, border-color 120ms ease;
	}
	.publish-btn:hover {
		background: var(--surface-hover);
		border-color: var(--brand);
	}

	.pub-overlay {
		position: fixed;
		inset: 0;
		background: rgba(20, 18, 14, 0.35);
		z-index: 70;
	}
	.pub-panel {
		position: fixed;
		top: 0;
		right: 0;
		height: 100vh;
		width: min(24rem, 92vw);
		background: var(--surface);
		border-left: 1px solid var(--border);
		box-shadow: var(--shadow);
		z-index: 71;
		padding: 1.25rem 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		overflow-y: auto;
	}
	.pub-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.pub-head h2 {
		font-size: 1.15rem;
		margin: 0;
	}
	.pub-close {
		font-size: 1.5rem;
		line-height: 1;
		color: var(--text-muted);
		background: none;
		border: none;
		cursor: pointer;
	}
	.pub-close:hover {
		color: var(--text);
	}
	.pub-state {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
		font-weight: 600;
	}
	.pub-state .dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		background: var(--border-strong);
	}
	.pub-state .dot.live {
		background: #3f9d6a;
	}
	.pub-state .dot.pending {
		background: #d9a13e;
	}
	.pub-sub {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.pub-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
	}
	.pub-link button {
		font: inherit;
		font-size: 0.85rem;
		color: var(--text-muted);
		background: none;
		border: 1px solid var(--border-strong);
		border-radius: 7px;
		padding: 0.25rem 0.55rem;
		cursor: pointer;
	}
	.pub-panel form {
		margin: 0;
	}
	.pub-btn {
		width: 100%;
		padding: 0.6rem;
		font: inherit;
		font-weight: 600;
		border-radius: 9px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}
	.pub-btn:hover {
		border-color: var(--text-muted);
	}
	.pub-btn.primary {
		background: var(--brand);
		color: #fff;
		border-color: transparent;
	}
	.pub-btn.primary:hover {
		filter: brightness(1.07);
	}
	.pub-btn.danger:hover {
		color: var(--danger);
		border-color: var(--danger);
	}

	.doc {
		max-width: 46rem;
		margin: 0 auto;
		padding: 48px 32px 96px;
	}

	header {
		margin-bottom: 32px;
	}

	.top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.doc-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
		margin-top: 4px;
	}
	.doc-actions a {
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		font-size: 12.5px;
		color: var(--text-muted);
	}
	.doc-actions a:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.doc-actions a.edit {
		border: 1px solid var(--border);
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 36px;
		font-weight: 600;
		line-height: 1.12;
		letter-spacing: -0.02em;
		font-variation-settings: 'opsz' 72;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin: 10px 0 0;
		font-size: 12.5px;
		color: var(--text-faint);
	}
	.sep {
		opacity: 0.5;
	}
	.pdf {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-sm);
		color: var(--text-faint);
		transition: background-color 120ms ease, color 120ms ease;
	}
	.pdf:hover {
		background: var(--surface-hover);
		color: var(--brand);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 12px 0 0;
	}
	.chip {
		padding: 1px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface);
		font-size: 11.5px;
		color: var(--text-muted);
	}
	.chip:hover {
		border-color: var(--border-strong);
		color: var(--text);
	}

	.empty,
	.render-error {
		color: var(--text-faint);
		font-size: 13.5px;
	}
	.render-error {
		padding: 12px 14px;
		border-radius: var(--radius-sm);
		background: var(--danger-wash);
		color: var(--danger);
		white-space: pre-wrap;
	}

	.state {
		display: inline-block;
		vertical-align: middle;
		margin-inline-start: 8px;
		padding: 2px 9px;
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: none;
	}
	.state.public {
		color: var(--brand);
		border: 1px solid var(--brand);
	}
	.state.pending {
		color: var(--text-muted);
		border: 1px solid var(--border-strong);
	}


	.backlinks {
		margin-top: 56px;
		padding-top: 20px;
		border-top: 1px solid var(--border);
	}
	.backlinks h2 {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.backlinks ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.backlinks li a {
		display: block;
		padding: 4px 0;
		font-size: 13.5px;
		color: var(--text-muted);
	}
	.backlinks li a:hover {
		color: var(--text);
	}

	@media (max-width: 720px) {
		.doc {
			padding: 28px 18px 64px;
		}
		h1 {
			font-size: 28px;
		}
	}
</style>
