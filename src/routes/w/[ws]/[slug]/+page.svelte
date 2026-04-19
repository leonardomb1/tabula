<script lang="ts">
	import type { PageData } from './$types';
	import Search from '$lib/Search.svelte';
	import BrandLogo from '$lib/BrandLogo.svelte';
	import UserMenu from '$lib/UserMenu.svelte';
	import PdfPreviewModal from '$lib/PdfPreviewModal.svelte';
	import DocReader from '$lib/DocReader.svelte';
	import { aiDock, toggleAi } from '$lib/aiDock.svelte';
	import { goto } from '$app/navigation';
	import { cubicOut } from 'svelte/easing';
	import { ROLES, isAtLeast } from '$lib/roles';

	let { data }: { data: PageData } = $props();

	const canWrite = $derived(isAtLeast(data.role, ROLES.EDITOR));

	let previewOpen = $state(false);
	let copied = $state(false);
	let menuOpen = $state(false);
	let menuWrapEl = $state<HTMLDivElement | null>(null);

	// Shared drop-in animation for the kebab menu. Matches UserMenu.
	function popIn(_node: Element, { duration = 160 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number) =>
				`opacity: ${t};` +
				`transform: translateY(${(1 - t) * -6}px) scale(${0.96 + t * 0.04});` +
				`transform-origin: top right;`
		};
	}

	function onDocClick(e: MouseEvent) {
		if (!menuOpen) return;
		if (menuWrapEl && !menuWrapEl.contains(e.target as Node)) menuOpen = false;
	}

	function onDocKey(e: KeyboardEvent) {
		if (menuOpen && e.key === 'Escape') menuOpen = false;
	}

	function copyPublicLink() {
		navigator.clipboard.writeText(`${location.origin}/public/${data.slug}`);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	async function deleteDoc() {
		const label = data.title && data.title !== 'Untitled' ? data.title : data.slug;
		if (!confirm(`Excluir "${label}"? Esta ação não pode ser desfeita.`)) return;
		const res = await fetch(`/api/delete/${data.slug}?ws=${data.ws.id}`, { method: 'DELETE' });
		if (res.ok) goto('/');
	}
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<svelte:document onclick={onDocClick} onkeydown={onDocKey} />

<div class="atelier">
	<header class="top-bar">
		<div class="top-bar-inner">
			<div class="brand">
				<BrandLogo height={26} />
				<span class="brand-sep">/</span>
				<a class="breadcrumb" href="/">{data.ws.name}</a>
			</div>

			<Search wsId={data.ws.id} wsName={data.ws.name} pageHeadings={data.toc} />

			<div class="actions">
				<button
					type="button"
					class="action-btn icon-btn"
					class:is-active={aiDock.open}
					onclick={toggleAi}
					title="Assistente IA (⌘J)"
					aria-label="Abrir assistente"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5.5 13v-1.5H3A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
						<path d="M5.2 7.2h.01M8 7.2h.01M10.8 7.2h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
					</svg>
				</button>
				{#if data.frontmatter.public}
					<button class="action-btn" onclick={copyPublicLink}>
						{copied ? '✓ Copiado' : '⬡ Público'}
					</button>
				{/if}
				{#if data.frontmatter.formal}
					<button class="action-btn" onclick={() => (previewOpen = true)}>↓ PDF</button>
				{/if}
				{#if canWrite}
					<a href="/new?edit={data.slug}&ws={data.ws.id}" class="action-btn primary">Editar</a>
				{/if}
				<div class="more-wrap" class:menu-open={menuOpen} bind:this={menuWrapEl}>
					<button
						class="action-btn more-btn"
						onclick={() => (menuOpen = !menuOpen)}
						aria-label="Mais ações"
						aria-expanded={menuOpen}
					>⋯</button>
					{#if menuOpen}
						<div class="more-menu" role="menu" transition:popIn>
							<a href="/api/export/{data.slug}?format=md&ws={data.ws.id}" class="more-item" download>↓ Markdown</a>
							<a href="/api/export/{data.slug}?format=html&ws={data.ws.id}" class="more-item" download>↓ HTML</a>
							{#if canWrite}
								<hr/>
								<button class="more-item danger" onclick={deleteDoc}>Excluir</button>
							{/if}
						</div>
					{/if}
				</div>
				<UserMenu />
			</div>
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
		backlinks={data.backlinks}
		wsId={data.ws.id}
	/>
</div>

<PdfPreviewModal
	open={previewOpen}
	slug={data.slug}
	wsId={data.ws.id}
	onClose={() => (previewOpen = false)}
/>

<style>
	.atelier {
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
	}

	/* ══════════════════════════════════════
	   Top bar — owns only chrome concerns (brand, search, actions,
	   user menu). The body/rails are delegated to <DocReader />.
	═══════════════════════════════════════ */
	.top-bar {
		position: sticky;
		top: 0;
		z-index: 40;
		border-bottom: 1px solid var(--rule);
	}

	/* Frosted-glass backdrop on a pseudo-element so `backdrop-filter`
	   doesn't create a containing block for fixed descendants —
	   otherwise the mobile bottom nav (fixed inside .actions) would
	   anchor to the top bar's edge in Chromium. */
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
		display: grid;
		grid-template-columns: 260px 1fr auto;
		align-items: center;
		gap: 24px;
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 10px;
		font-family: var(--font-serif-display);
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--ink);
		min-width: 0;
	}

	.brand-sep { color: var(--ink-muted); font-weight: 400; }

	.breadcrumb {
		font-family: var(--font-sans);
		font-size: 13px;
		color: var(--ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 10px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		font-size: 13px;
		color: var(--ink-soft);
		font-family: var(--font-sans);
	}

	.action-btn:hover {
		background: var(--surface);
		border-color: var(--rule);
		color: var(--ink);
	}

	.action-btn.primary {
		background: var(--ink);
		color: var(--bg);
		border-color: var(--ink);
	}

	.action-btn.primary:hover {
		background: oklch(0.3 0.015 80);
		border-color: transparent;
	}

	.action-btn.icon-btn {
		width: 32px;
		padding: 0;
		justify-content: center;
	}

	.action-btn.icon-btn.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
		border-color: transparent;
	}

	.more-wrap { position: relative; }
	.more-btn { width: 32px; padding: 0; justify-content: center; font-size: 18px; line-height: 0; }

	.more-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		min-width: 180px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.2);
		padding: 4px;
		display: flex;
		flex-direction: column;
		z-index: 30;
	}

	.more-menu hr {
		border: 0;
		border-top: 1px solid var(--rule-soft);
		margin: 4px 2px;
	}

	.more-item {
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 13px;
		color: var(--ink-soft);
		text-align: left;
		background: transparent;
		border: 0;
		font-family: var(--font-sans);
	}

	.more-item:hover { background: var(--bg-deep); color: var(--ink); }
	.more-item.danger { color: oklch(0.5 0.18 25); }
	.more-item.danger:hover { background: oklch(0.95 0.03 25); }

	/* Search sits center. Selector pierces Svelte scoping to target the
	   Search component's root element directly. */
	:global(.top-bar-inner > .search-trigger) {
		justify-self: center;
		min-width: 240px;
		max-width: 420px;
		width: 100%;
	}

	/* ══════════════════════════════════════
	   Responsive — top bar only; DocReader owns its own breakpoints.
	═══════════════════════════════════════ */
	@media (max-width: 860px) {
		.top-bar-inner {
			grid-template-columns: auto 1fr auto;
			height: auto;
			padding: 10px 14px;
			gap: 10px;
		}
	}

	/* Mobile bottom nav — same pattern as the home route. The viewer's
	   actions cluster moves from the top bar's right slot to a fixed
	   bottom bar. */
	@media (max-width: 640px) {
		.atelier { padding-bottom: 68px; }

		.top-bar-inner { grid-template-columns: auto minmax(0, 1fr); }
		.brand { min-width: 0; flex-shrink: 1; }
		.brand :global(.brand-text) { display: none; }
		.breadcrumb { max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

		.actions {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
			background: var(--bg);
			border-top: 1px solid var(--rule);
			justify-content: space-around;
			gap: 2px;
			z-index: 40;
			box-shadow: 0 -12px 24px -16px rgba(0, 0, 0, 0.12);
			/* Force a new compositing layer so the sticky top-bar ancestor
			   can't drag the fixed bar along during scroll on mobile
			   Chromium/WebKit — classic "fixed inside sticky" bug. */
			transform: translateZ(0);
			will-change: transform;
		}

		.action-btn.primary { padding: 0 14px; height: 36px; }

		/* Kebab + UserMenu pop upward on mobile so they don't render off-screen. */
		.more-menu {
			top: auto;
			bottom: calc(100% + 6px);
			transform-origin: bottom right;
		}

		.actions :global(.dropdown) {
			top: auto;
			bottom: calc(100% + 0.5rem);
			transform-origin: bottom right;
		}
	}
</style>
