<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';
	import BrandLogo from '$lib/BrandLogo.svelte';
	import UserMenu from '$lib/UserMenu.svelte';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	const items = $derived([
		{ href: '/settings/account',    label: 'Conta',      show: true },
		{ href: '/settings/workspaces', label: 'Workspaces', show: true },
		{ href: '/settings/platform',   label: 'Plataforma', show: data.isPlatformAdmin }
	].filter((i) => i.show));

	const pathname = $derived($page.url.pathname);
	const isActive = (href: string) =>
		pathname === href || pathname.startsWith(href + '/');
</script>

<svelte:head>
	<title>Configurações</title>
</svelte:head>

<div class="shell">
	<header class="top-bar">
		<div class="top-bar-inner">
			<a class="brand" href="/" aria-label="Voltar">
				<BrandLogo height={24} />
				<span class="brand-sep">/</span>
				<span class="breadcrumb">Configurações</span>
			</a>
			<UserMenu />
		</div>
	</header>

	<main class="layout">
		<aside class="nav">
			<p class="nav-eyebrow">Ajustes</p>
			<ul>
				{#each items as item}
					<li>
						<a href={item.href} class:is-active={isActive(item.href)}>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</aside>

		<section class="content">
			{@render children()}
		</section>
	</main>
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
		background: color-mix(in oklab, var(--bg) 88%, transparent);
		backdrop-filter: saturate(1.2) blur(10px);
		-webkit-backdrop-filter: saturate(1.2) blur(10px);
	}

	.top-bar-inner {
		max-width: 1320px;
		margin: 0 auto;
		padding: 0 28px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		font-family: var(--font-sans);
	}

	.brand-sep { color: var(--ink-muted); font-family: var(--font-serif-display); }

	.breadcrumb {
		font-size: 13px;
		color: var(--ink-soft);
	}

	.layout {
		max-width: 1320px;
		margin: 0 auto;
		padding: 40px 28px 80px;
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: 56px;
	}

	.nav {
		position: sticky;
		top: 80px;
		align-self: start;
		font-family: var(--font-sans);
	}

	.nav-eyebrow {
		margin: 0 0 10px 10px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.nav ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.nav a {
		display: block;
		padding: 7px 10px;
		border-radius: 6px;
		font-size: 13.5px;
		color: var(--ink-soft);
		transition: background 0.12s, color 0.12s;
	}

	.nav a:hover { background: var(--bg-deep); color: var(--ink); }

	.nav a.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 500;
	}

	.content { min-width: 0; }

	@media (max-width: 860px) {
		.layout {
			grid-template-columns: 1fr;
			gap: 24px;
			padding: 24px 20px 80px;
		}
		.nav { position: static; }
		.nav ul { flex-direction: row; flex-wrap: wrap; gap: 4px; }
		.nav a { padding: 6px 12px; }
	}
</style>
