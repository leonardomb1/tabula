<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let logoFailed = $state(false);
</script>

<div class="wiki-shell">
	<header class="bar">
		<a class="brand" href="/wiki">
			{#if data.branding.logoUrl && !logoFailed}
				<img
					class="logo"
					src={data.branding.logoUrl}
					alt={data.branding.name}
					onerror={() => (logoFailed = true)}
				/>
			{:else}
				<span class="wordmark">{data.branding.name}</span>
			{/if}
			<span class="divider" aria-hidden="true"></span>
			<span class="site">{m.wiki_title()}</span>
		</a>
		<a class="to-app" href="/">{m.wiki_open_in_app()}</a>
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.wiki-shell {
		min-height: 100dvh;
		background: var(--bg);
		color: var(--text);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 10px 22px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		color: var(--text);
	}
	.logo {
		height: 22px;
		width: auto;
	}
	.wordmark {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 15px;
	}
	.divider {
		width: 1px;
		height: 16px;
		background: var(--border-strong);
	}
	.site {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.to-app {
		font-size: 12.5px;
		color: var(--text-muted);
		text-decoration: none;
	}
	.to-app:hover {
		color: var(--text);
	}
</style>
