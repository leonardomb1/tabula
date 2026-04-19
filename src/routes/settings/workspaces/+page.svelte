<script lang="ts">
	import type { PageData } from './$types';
	import { ROLES, isAtLeast, type Role } from '$lib/roles';

	let { data }: { data: PageData } = $props();

	const ROLE_LABEL: Record<Role, string> = {
		[ROLES.VIEWER]: 'Leitor',
		[ROLES.EDITOR]: 'Editor',
		[ROLES.MAINTAINER]: 'Mantenedor'
	};
</script>

<header class="section-head">
	<p class="eyebrow">Workspaces</p>
	<h1 class="title">Seus workspaces</h1>
	<p class="lede">Clique em um workspace do qual você é mantenedor para gerenciá-lo.</p>
</header>

<ul class="list">
	{#each data.workspaces as ws}
		{@const canManage = isAtLeast(ws.role, ROLES.MAINTAINER)}
		<li>
			{#if canManage}
				<a class="item" href="/settings/workspaces/{ws.id}">
					<div class="main">
						<p class="name">{ws.name}</p>
						<p class="sub"><code>{ws.id}</code></p>
					</div>
					<span class="role-chip role-{ws.role}">{ws.role ? ROLE_LABEL[ws.role] : ''}</span>
					<svg class="chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>
			{:else}
				<div class="item is-readonly">
					<div class="main">
						<p class="name">{ws.name}</p>
						<p class="sub"><code>{ws.id}</code></p>
					</div>
					<span class="role-chip role-{ws.role}">{ws.role ? ROLE_LABEL[ws.role] : ''}</span>
				</div>
			{/if}
		</li>
	{:else}
		<li class="empty">Você não está em nenhum workspace de time.</li>
	{/each}
</ul>

<style>
	.section-head { margin-bottom: 32px; max-width: 680px; }

	.eyebrow {
		margin: 0 0 6px;
		font-family: var(--font-sans);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	.title {
		margin: 0 0 8px;
		font-family: var(--font-serif-display);
		font-size: 32px;
		font-weight: 500;
		letter-spacing: -0.015em;
		color: var(--ink);
	}

	.lede {
		margin: 0;
		font-family: var(--font-serif-body);
		color: var(--ink-soft);
		font-size: 15px;
		font-style: italic;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: 780px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 16px;
		border: 1px solid var(--rule);
		border-radius: 8px;
		background: var(--surface);
		color: var(--ink);
		transition: border-color 0.12s, background 0.12s;
	}

	a.item:hover {
		border-color: var(--accent);
		background: color-mix(in oklab, var(--accent) 4%, var(--surface));
	}

	.item.is-readonly { opacity: 0.75; }

	.main { flex: 1; min-width: 0; }

	.name {
		margin: 0 0 3px;
		font-family: var(--font-serif-display);
		font-size: 16px;
		font-weight: 500;
		color: var(--ink);
	}

	.sub { margin: 0; font-size: 12px; color: var(--ink-muted); }
	.sub code { font-family: var(--font-mono); }

	.role-chip {
		flex-shrink: 0;
		padding: 3px 10px;
		border-radius: 999px;
		font-family: var(--font-sans);
		font-size: 11px;
		background: var(--chip-bg);
		color: var(--ink-soft);
	}

	.role-chip.role-maintainer {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 500;
	}

	.chev {
		width: 14px;
		height: 14px;
		color: var(--ink-muted);
		flex-shrink: 0;
	}

	a.item:hover .chev { color: var(--accent-ink); }

	.empty {
		padding: 32px 16px;
		text-align: center;
		font-family: var(--font-serif-body);
		font-style: italic;
		color: var(--ink-muted);
		font-size: 14px;
	}
</style>
