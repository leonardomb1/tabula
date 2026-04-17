<script lang="ts">
	import type { PageData } from './$types';
	import Search from '$lib/Search.svelte';
	import BrandLogo from "$lib/BrandLogo.svelte";
	import UserMenu from '$lib/UserMenu.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	let { data }: { data: PageData } = $props();

	$effect(() => {
		data.html;
		import('mermaid').then(({ default: mermaid }) => {
			mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
			mermaid.run({ querySelector: '.mermaid' });
		});
	});

	$effect(() => {
		const highlight = $page.url.searchParams.get('highlight');
		if (!highlight) return;

		// Wait for the HTML to be in the DOM
		setTimeout(() => {
			const body = document.querySelector('.doc-body');
			if (!body) return;

			const search = highlight.toLowerCase();
			const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
			let node: Node | null;

			while ((node = walker.nextNode())) {
				const text = node.textContent ?? '';
				const idx = text.toLowerCase().indexOf(search);
				if (idx === -1) continue;

				const range = document.createRange();
				range.setStart(node, idx);
				range.setEnd(node, idx + highlight.length);

				const mark = document.createElement('mark');
				mark.className = 'text-highlight';
				try {
					range.surroundContents(mark);
					mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
				} catch {
					// surroundContents fails if range spans multiple elements — skip
				}
				break;
			}
		}, 80);
	});

	let copied = $state(false);
	let generatingPdf = $state(false);
	let pdfError = $state('');
	let menuOpen = $state(false);

	async function downloadPdf() {
		generatingPdf = true;
		pdfError = '';
		try {
			const res = await fetch(`/api/export/${data.slug}?format=pdf&ws=${data.ws.id}`);
			if (!res.ok) { pdfError = 'Erro ao gerar PDF'; return; }
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${data.slug}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			pdfError = 'Erro ao gerar PDF';
		} finally {
			generatingPdf = false;
		}
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

	function formatMeta(d: Date) {
		return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="doc-page">
	<header class="site-header">
		<div class="header-inner">
			<BrandLogo />
			<a href="/" class="back-link" aria-label="Voltar para {data.ws.name}">
				<span class="back-full">← {data.ws.name}</span>
				<span class="back-short" aria-hidden="true">←</span>
			</a>
			<Search />
			<div class="header-actions">
				<div class="extras" class:menu-open={menuOpen}>
					{#if data.frontmatter.public}
						<button class="action-btn public-link-btn" onclick={copyPublicLink}>
							{copied ? '✓ Copiado!' : '⬡ Público'}
						</button>
					{/if}
					{#if data.frontmatter.formal}
						<button class="action-btn pdf-btn" onclick={downloadPdf} disabled={generatingPdf}>
							{#if generatingPdf}
								<span class="pdf-spinner"></span> Gerando…
							{:else if pdfError}
								✕ Erro
							{:else}
								↓ PDF
							{/if}
						</button>
					{/if}
					<a href="/api/export/{data.slug}?format=md&ws={data.ws.id}" class="action-btn" download>↓ MD</a>
					<a href="/api/export/{data.slug}?format=html&ws={data.ws.id}" class="action-btn" download>↓ HTML</a>
					<button class="delete-btn" onclick={deleteDoc}>Excluir</button>
				</div>
				<a href="/new?edit={data.slug}&ws={data.ws.id}" class="edit-btn">Editar</a>
				<button class="menu-toggle" onclick={() => menuOpen = !menuOpen} aria-label="Mais ações" aria-expanded={menuOpen}>⋯</button>
			</div>
			<UserMenu />
		</div>
	</header>

	<div class="doc-layout">
		{#if data.toc.length > 2 || data.backlinks.length > 0}
			<aside class="toc">
				{#if data.toc.length > 2}
					<p class="toc-heading">Índice</p>
					<ol class="toc-list">
						{#each data.toc as entry}
							<li class="toc-item toc-level-{entry.level}">
								<a href="#{entry.id}">{entry.text}</a>
							</li>
						{/each}
					</ol>
				{/if}
				{#if data.backlinks.length > 0}
					<p class="toc-heading" style="margin-top: {data.toc.length > 2 ? '1.5rem' : '0'}">Referenciado por</p>
					<div class="backlinks-list">
						{#each data.backlinks as bl}
							<a href="/{bl.slug}" class="backlink-chip">{bl.title}</a>
						{/each}
					</div>
				{/if}
			</aside>
		{/if}

		<article class="doc-body prose">
			{@html data.html}

			<footer class="article-footer">
				{#if data.frontmatter.author}
					<span>Por {data.frontmatter.author}</span>
					<span class="sep">·</span>
				{/if}
				{#if data.frontmatter.date}
					<span>Criado em {formatMeta(new Date(data.frontmatter.date))}</span>
					<span class="sep">·</span>
				{/if}
				<span>Modificado em {formatMeta(data.mtime)}</span>
				{#if data.frontmatter.public}
					<span class="sep">·</span>
					<span class="public-badge">público</span>
				{/if}
				{#if data.frontmatter.formal}
					<span class="sep">·</span>
					<span class="formal-badge">{data.frontmatter.doctype ?? 'documento formal'}</span>
				{/if}
				{#if data.frontmatter.version}
					<span class="sep">·</span>
					<span>v{data.frontmatter.version}</span>
				{/if}
				{#if data.frontmatter.tags?.length}
					<span class="sep">·</span>
					<div class="footer-tags">
						{#each data.frontmatter.tags as tag}
							<a href="/?tag={encodeURIComponent(tag)}" class="footer-tag">{tag}</a>
						{/each}
					</div>
				{/if}
			</footer>
		</article>
	</div>
</div>

<style>
	/* ── Layout ── */
	.doc-page {
		min-height: 100vh;
		background: #fafaf8;
	}

	.site-header {
		background: #fff;
		border-bottom: 1px solid #e0ddd5;
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.header-inner {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1.1rem 2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	:global(.header-inner .search-wrap) {
		flex: 1;
		min-width: 0;
	}

	.back-link {
		font-size: 0.85rem;
		color: #888;
		text-decoration: none;
		font-family: ui-sans-serif, system-ui, sans-serif;
		white-space: nowrap;
		transition: color 0.1s;
		flex-shrink: 0;
	}

	.back-link:hover { color: #1a1a1a; }
	.back-short { display: none; }

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		position: relative;
	}

	.extras {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.menu-toggle { display: none; }

	.action-btn {
		background: #f5f3ee;
		color: #555;
		text-decoration: none;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		white-space: nowrap;
		transition: background 0.15s;
		border: 1px solid #e0ddd5;
	}

	.action-btn:hover { background: #ebe8e0; }

	.pdf-btn {
		border-color: #c7b8f5;
		color: #5b21b6;
		background: #f5f3ff;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 4.5rem;
		justify-content: center;
	}

	.pdf-btn:hover:not(:disabled) { background: #ede9fe; }
	.pdf-btn:disabled { opacity: 0.7; cursor: not-allowed; }

	.pdf-spinner {
		width: 0.7rem;
		height: 0.7rem;
		border: 1.5px solid #c7b8f5;
		border-top-color: #5b21b6;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.public-link-btn {
		border-color: #bbf7d0;
		color: #166534;
		background: #f0fdf4;
		cursor: pointer;
		min-width: 5.5rem;
		transition: background 0.15s, color 0.15s;
	}

	.public-link-btn:hover { background: #dcfce7; }

	.edit-btn {
		background: #1a1a1a;
		color: #fff;
		text-decoration: none;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.edit-btn:hover { background: var(--brand); }

	.delete-btn {
		background: none;
		border: 1px solid #e8e5df;
		color: #aaa;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		cursor: pointer;
		transition: all 0.15s;
	}

	.delete-btn:hover {
		background: #fee2e2;
		border-color: #fca5a5;
		color: #b91c1c;
	}

	/* ── Metadata footer ── */
	.article-footer {
		margin-top: 3rem;
		padding-top: 1rem;
		border-top: 1px solid #e8e5df;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.8rem;
		color: #aaa;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		align-items: center;
	}

	.article-footer .sep { color: #ddd; }

	.footer-tags {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.footer-tag {
		background: #f0ede6;
		color: #555;
		padding: 0.1em 0.55em;
		border-radius: 999px;
		font-size: 0.72rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		text-decoration: none;
		transition: background 0.1s, color 0.1s;
		line-height: 1.6;
	}

	.footer-tag:hover {
		background: #1a1a1a;
		color: #fff;
	}

	.article-footer .public-badge {
		background: #dcfce7;
		color: #166534;
		padding: 0.1em 0.5em;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 500;
	}

	.article-footer .formal-badge {
		background: #ede9fe;
		color: #5b21b6;
		padding: 0.1em 0.5em;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 500;
	}

	.doc-layout {
		max-width: 900px;
		margin: 0 auto;
		padding: 2.5rem 2rem 4rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 3rem;
	}

	@media (min-width: 900px) {
		.doc-layout:has(.toc) {
			grid-template-columns: 200px minmax(0, 1fr);
		}
	}

	/* ── TOC ── */
	.toc {
		position: sticky;
		top: 2rem;
		align-self: start;
		font-family: ui-sans-serif, system-ui, sans-serif;
		padding-top: 0.25rem;
	}

	.toc-heading {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #aaa;
		margin: 0 0 0.75rem;
	}

	.toc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-left: 2px solid #e8e5df;
	}

	.toc-item {
		margin: 0;
		line-height: 1.4;
	}

	.toc-item a {
		display: block;
		padding: 0.25rem 0 0.25rem 0.85rem;
		font-size: 0.82rem;
		color: #666;
		text-decoration: none;
		transition: color 0.1s;
	}

	.toc-item a:hover {
		color: #1a1a1a;
	}

	.toc-level-2 a {
		padding-left: 0.85rem;
	}

	.toc-level-3 a {
		padding-left: 1.7rem;
		font-size: 0.78rem;
		color: #999;
	}

	/* ── Document body (pandoc-like) ── */
	:global(.doc-body) {
		font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, 'Times New Roman', serif;
		font-size: 1.1rem;
		line-height: 1.75;
		color: #1a1a1a;
		max-width: 720px;
		overflow-wrap: break-word;
	}

	:global(.doc-body .table-wrap) {
		overflow-x: auto;
		max-width: 100%;
		margin: 1.5em 0;
	}
	:global(.doc-body .table-wrap table) { margin: 0; }

	:global(.doc-body h1) {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1.2;
		margin: 0 0 0.25em;
		border-bottom: 1px solid #e0ddd5;
		padding-bottom: 0.4em;
	}

	:global(.doc-body h2) {
		font-size: 1.45rem;
		font-weight: 600;
		margin: 2.2em 0 0.6em;
		border-bottom: 1px solid #e8e5df;
		padding-bottom: 0.25em;
	}

	:global(.doc-body h3) {
		font-size: 1.2rem;
		font-weight: 600;
		margin: 1.8em 0 0.5em;
	}

	:global(.doc-body h4) {
		font-size: 1rem;
		font-weight: 600;
		margin: 1.5em 0 0.4em;
		font-style: italic;
	}

	:global(.doc-body p) {
		margin: 0 0 1.1em;
	}

	:global(.doc-body a) {
		color: var(--brand);
		text-decoration: none;
		border-bottom: 1px solid color-mix(in srgb, var(--brand) 25%, transparent);
		transition: border-color 0.1s;
	}

	:global(.doc-body a:hover) {
		border-bottom-color: var(--brand);
	}

	:global(.doc-body ul),
	:global(.doc-body ol) {
		padding-left: 2em;
		margin: 0 0 1.1em;
	}

	:global(.doc-body li) {
		margin-bottom: 0.3em;
	}

	:global(.doc-body li > p) {
		margin-bottom: 0.5em;
	}

	:global(.doc-body blockquote) {
		margin: 1.5em 0;
		padding: 0.1em 0 0.1em 1.25em;
		border-left: 4px solid #d1c9b0;
		color: #555;
		font-style: italic;
	}

	:global(.doc-body blockquote p) {
		margin-bottom: 0.5em;
	}

	:global(.doc-body code) {
		font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
		font-size: 0.875em;
		background: #f5f2eb;
		padding: 0.15em 0.35em;
		border-radius: 3px;
		color: #b5470d;
	}

	:global(.doc-body pre) {
		background: #1e1e1e;
		border-radius: 6px;
		padding: 1.1em 1.3em;
		overflow-x: auto;
		max-width: 100%;
		margin: 1.5em 0;
		line-height: 1.5;
	}

	:global(.doc-body pre.mermaid) {
		background: #ffffff;
		border: 1px solid #e0ddd5;
		padding: 1.5em 1em;
	}

	:global(.doc-body pre code) {
		background: none;
		padding: 0;
		color: #d4d4d4;
		font-size: 0.85rem;
		border-radius: 0;
	}

	:global(.doc-body table) {
		width: 100%;
		border-collapse: collapse;
		margin: 1.5em 0;
		font-size: 0.95em;
	}

	:global(.doc-body th) {
		background: #f5f2eb;
		font-weight: 600;
		text-align: left;
		padding: 0.5em 0.85em;
		border: 1px solid #d1c9b0;
	}

	:global(.doc-body td) {
		padding: 0.45em 0.85em;
		border: 1px solid #e0ddd5;
	}

	:global(.doc-body tr:nth-child(even) td) {
		background: #faf9f5;
	}

	:global(.doc-body hr) {
		border: none;
		border-top: 1px solid #e0ddd5;
		margin: 2.5em 0;
	}

	:global(.doc-body img) {
		max-width: 100%;
		height: auto;
		border-radius: 4px;
	}

	/* ── Highlight.js theme (light) ── */
	:global(.hljs) { color: #abb2bf; }
	:global(.hljs-keyword, .hljs-selector-tag, .hljs-built_in) { color: #c678dd; }
	:global(.hljs-string, .hljs-attr) { color: #98c379; }
	:global(.hljs-number, .hljs-literal) { color: #d19a66; }
	:global(.hljs-comment) { color: #5c6370; font-style: italic; }
	:global(.hljs-title, .hljs-section) { color: #61afef; }
	:global(.hljs-type, .hljs-class) { color: #e5c07b; }
	:global(.hljs-variable, .hljs-name) { color: #e06c75; }
	:global(.hljs-tag) { color: #e06c75; }
	:global(.hljs-meta) { color: #56b6c2; }
	:global(.hljs-symbol, .hljs-bullet) { color: #56b6c2; }

	/* ── Citation highlight ── */
	:global(.text-highlight) {
		background: #fef08a;
		border-radius: 2px;
		padding: 0.05em 0.1em;
		outline: 2px solid #fbbf24;
		outline-offset: 1px;
	}

	/* ── Wiki links ── */
	:global(.wiki-link) {
		color: #7c3aed;
		border-bottom: 1px dashed #c4b5fd;
		font-style: italic;
		text-decoration: none;
	}

	:global(.wiki-link:hover) {
		border-bottom-color: #7c3aed;
	}

	/* ── Backlinks panel ── */
	.backlinks-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.backlink-chip {
		display: inline-block;
		padding: 0.2em 0.6em;
		background: #f5f2ff;
		border: 1px solid #ddd6fe;
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: ui-monospace, monospace;
		color: #7c3aed;
		text-decoration: none;
		transition: background 0.1s, border-color 0.1s;
	}

	.backlink-chip:hover {
		background: #ede9fe;
		border-color: #c4b5fd;
	}

	@media (max-width: 640px) {
		.header-inner {
			padding: 0.65rem 0.9rem;
			gap: 0.5rem;
			flex-wrap: wrap;
		}
		:global(.header-inner .search-wrap) { order: 10; flex-basis: 100%; }

		.back-full { display: none; }
		.back-short { display: inline; font-size: 1.1rem; line-height: 1; }

		.header-actions { margin-left: auto; }

		.extras {
			display: none;
		}
		.extras.menu-open {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			position: absolute;
			top: calc(100% + 0.5rem);
			right: 0;
			background: #fff;
			border: 1px solid #e0ddd5;
			border-radius: 8px;
			box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
			padding: 0.4rem;
			gap: 0.25rem;
			z-index: 50;
			min-width: 10rem;
		}
		.extras.menu-open .action-btn,
		.extras.menu-open .delete-btn {
			text-align: left;
			width: 100%;
		}
		.menu-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
			background: #f5f3ee;
			border: 1px solid #e0ddd5;
			color: #555;
			font-size: 1.1rem;
			line-height: 1;
			padding: 0.4rem 0.7rem;
			border-radius: 6px;
			cursor: pointer;
			flex-shrink: 0;
			min-width: 2.4rem;
			min-height: 2.2rem;
		}

		.doc-layout {
			padding: 1.5rem 1rem 6rem;
			gap: 2rem;
		}

		.toc { position: static; }
		.toc-list { border-left: none; border-top: 2px solid #e8e5df; padding-top: 0.5rem; }
		.toc-item a { padding: 0.35rem 0; }
		.toc-level-2 a, .toc-level-3 a { padding-left: 0.25rem; }

		:global(.doc-body) { font-size: 1rem; }
		:global(.doc-body h1) { font-size: 1.5rem; }
		:global(.doc-body h2) { font-size: 1.25rem; }
		:global(.doc-body h3) { font-size: 1.1rem; }
	}
</style>
