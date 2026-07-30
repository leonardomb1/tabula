<script lang="ts">
	/**
	 * Error page for every status. Rendered outside the app shell, so it also covers
	 * failures on /login and before a session exists.
	 */
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { errorCopy, usefulDetail } from '$lib/errors';
	import { homeHref, loginHref } from '$lib/nav';

	const status = $derived(page.status);
	const copy = $derived(errorCopy(status));
	const detail = $derived(usefulDetail(page.error?.message, status));
	const reference = $derived(page.error?.id ?? '');

	// history.length is only meaningful in the browser, and only after mount.
	let canGoBack = $state(false);
	onMount(() => {
		canGoBack = history.length > 1;
	});

	const signInHref = $derived(loginHref(page.url.pathname + page.url.search));
</script>

<svelte:head>
	<title>{status} · {copy.title}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap">
	<main class="panel">
		<p class="status" aria-hidden="true">{status}</p>
		<h1>{copy.title}</h1>
		<p class="desc">{copy.description}</p>

		{#if detail}
			<div class="detail">
				<span class="detail-label">{m.error_detail()}</span>
				<code>{detail}</code>
			</div>
		{/if}

		<div class="actions">
			{#if status === 401}
				<a class="primary" href={signInHref}>{m.error_sign_in()}</a>
			{:else}
				<a class="primary" href={homeHref()}>{m.error_back_home()}</a>
			{/if}

			{#if status >= 500}
				<button type="button" class="ghost" onclick={() => location.reload()}>
					{m.error_retry()}
				</button>
			{:else if canGoBack}
				<button type="button" class="ghost" onclick={() => history.back()}>
					{m.error_go_back()}
				</button>
			{/if}
		</div>

		{#if reference}
			<p class="ref">{m.error_reference({ id: reference })}</p>
		{/if}
	</main>
</div>

<style>
	.wrap {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: 24px;
		background: var(--bg);
	}

	.panel {
		width: min(440px, 100%);
		text-align: center;
	}

	.status {
		margin: 0;
		font-family: var(--font-display);
		font-size: 64px;
		font-weight: 600;
		line-height: 1;
		font-variation-settings: 'opsz' 96;
		color: var(--border-strong);
		letter-spacing: -0.02em;
	}

	h1 {
		margin: 10px 0 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
		font-variation-settings: 'opsz' 48;
		color: var(--text);
	}

	.desc {
		margin: 8px auto 0;
		max-width: 42ch;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--text-muted);
	}

	.detail {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 18px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		text-align: start;
	}
	.detail-label {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-faint);
	}
	.detail code {
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-top: 22px;
	}

	.primary,
	.ghost {
		height: 32px;
		padding: 0 14px;
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-sm);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
	}
	.primary {
		border: 0;
		background: var(--brand);
		color: #fff;
	}
	.ghost {
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text);
		transition: background-color 120ms ease;
	}
	.ghost:hover {
		background: var(--surface-hover);
	}

	.ref {
		margin: 16px 0 0;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-faint);
	}
</style>
