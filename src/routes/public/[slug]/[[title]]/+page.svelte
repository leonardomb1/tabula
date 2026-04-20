<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import BrandLogo from '$lib/BrandLogo.svelte';
	import DocReader from '$lib/DocReader.svelte';
	import { autoHideOnScroll } from '$lib/autoHideOnScroll';

	let { data }: { data: PageData } = $props();

	const loggedIn = $derived($page.data.user != null);
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="shell">
	<header class="top-bar" use:autoHideOnScroll>
		<div class="top-bar-inner">
			<BrandLogo height={26} href="/public" />

			<span class="spacer"></span>

			{#if loggedIn}
				<a href="/" class="action-btn">Ir para o app</a>
			{:else}
				<a href="/login" class="action-btn">Entrar</a>
			{/if}
		</div>
	</header>

	<DocReader
		doc={{
			title: data.title,
			html: data.html,
			toc: data.toc,
			frontmatter: data.frontmatter,
			mtime: data.mtime,
			wordCount: data.wordCount,
			readMinutes: data.readMinutes
		}}
		citedRefs={data.citedRefs}
	/>
</div>

<style>
	.shell {
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
	}

	.top-bar {
		position: sticky;
		top: 0;
		z-index: 40;
		border-bottom: 1px solid var(--rule);
		padding-top: env(safe-area-inset-top);
		transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
		will-change: transform;
	}
	:global(.top-bar.is-hidden) { transform: translateY(-100%); }

	.top-bar::before {
		content: '';
		position: absolute;
		inset: 0;
		background: color-mix(in oklab, var(--bg) 88%, transparent);
		backdrop-filter: saturate(1.2) blur(10px);
		-webkit-backdrop-filter: saturate(1.2) blur(10px);
		z-index: -1;
	}

	.top-bar-inner {
		max-width: 1520px;
		margin: 0 auto;
		padding: 0 28px;
		height: 56px;
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.spacer { flex: 1; }

	.action-btn {
		display: inline-flex;
		align-items: center;
		height: 32px;
		padding: 0 14px;
		background: var(--ink);
		color: var(--bg);
		border: 1px solid var(--ink);
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
	}

	.action-btn:hover {
		background: oklch(0.3 0.015 80);
		border-color: transparent;
	}

	@media (max-width: 640px) {
		.top-bar-inner { padding: 10px 14px; height: auto; }
	}
</style>
