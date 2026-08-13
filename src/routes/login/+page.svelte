<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { PRODUCT_NAME } from '$lib/branding';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let logoFailed = $state(false);

	const branding = $derived(data.branding);
	const showLogo = $derived(!!branding.logoUrl && !logoFailed);
	// Reached only when a flow failed: the happy path redirects out of this load.
	const retryHref = $derived(`/login?redirectTo=${encodeURIComponent(data.retryTo ?? '/')}`);
</script>

<svelte:head>
	<title>{m.login_title()} · {PRODUCT_NAME}</title>
</svelte:head>

<main class="page">
	<div class="card">
		<div class="brand">
			{#if showLogo && branding.logoUrl}
				<img
					class="logo"
					src={branding.logoUrl}
					alt={branding.name}
					onerror={() => (logoFailed = true)}
				/>
			{:else}
				<span class="wordmark">{branding.name}</span>
			{/if}
		</div>

		<h1>{m.login_title()}</h1>
		<p class="subtitle">{m.login_subtitle()}</p>

		{#if data.error}
			<p class="error" role="alert">{data.error}</p>
		{/if}

		<a class="submit" href={retryHref} data-sveltekit-reload>{m.login_submit()}</a>
	</div>
</main>

<style>
	.page {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.card {
		width: 100%;
		max-width: 25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 2rem;
		box-shadow: var(--shadow);
	}

	.brand {
		display: flex;
		justify-content: center;
		margin-bottom: 1.75rem;
	}
	.logo {
		height: 2.5rem;
		width: auto;
		max-width: 100%;
	}
	.wordmark {
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.subtitle {
		margin: 0.375rem 0 1.5rem;
		color: var(--text-muted);
		font-size: 0.9375rem;
	}

	.error {
		margin: 0 0 1.25rem;
		padding: 0.7rem 0.85rem;
		border-radius: 8px;
		background: var(--danger-wash);
		color: var(--danger);
		font-size: 0.875rem;
	}

	.submit {
		display: block;
		width: 100%;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		background: var(--brand);
		color: #fff;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: center;
		text-decoration: none;
	}
	.submit:hover {
		filter: brightness(1.07);
	}
</style>
