<script lang="ts">
	import type { PageData } from './$types';
	import BrandLogo from "$lib/BrandLogo.svelte";
	import UserMenu from '$lib/UserMenu.svelte';

	let { data }: { data: PageData } = $props();

	$effect(() => {
		data.html;
		import('mermaid').then(({ default: mermaid }) => {
			mermaid.initialize({ startOnLoad: false, theme: 'neutral' });
			mermaid.run({ querySelector: '.mermaid' });
		});
	});

	function formatMeta(d: Date) {
		return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>{data.title}</title>
</svelte:head>

<div class="public-page">
	<header class="site-header">
		<div class="header-inner">
			<BrandLogo />
			<a href="/public" class="back-btn">← {data.branding.name} · Público</a>
			<div class="spacer"></div>
			<UserMenu />
		</div>
	</header>

	<div class="doc-layout">
		{#if data.toc.length > 2}
			<aside class="toc">
				<p class="toc-heading">Índice</p>
				<ol class="toc-list">
					{#each data.toc as entry}
						<li class="toc-item toc-level-{entry.level}">
							<a href="#{entry.id}">{entry.text}</a>
						</li>
					{/each}
				</ol>
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
				{/if}
				{#if data.frontmatter.tags?.length}
					<span class="sep">·</span>
					<div class="footer-tags">
						{#each data.frontmatter.tags as tag}
							<span class="footer-tag">{tag}</span>
						{/each}
					</div>
				{/if}
			</footer>
		</article>
	</div>
</div>

<style>
	.public-page {
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

	.spacer { flex: 1; }

	.header-inner {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1.1rem 2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-btn {
		font-size: 0.85rem;
		color: #888;
		text-decoration: none;
		font-family: ui-sans-serif, system-ui, sans-serif;
		white-space: nowrap;
		transition: color 0.1s;
		flex-shrink: 0;
	}
	.back-btn:hover { color: #1a1a1a; }

	/* ── Layout ── */
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
		line-height: 1.6;
	}

	/* ── Document body ── */
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

	:global(.doc-body h1) { font-size: 2rem; font-weight: 700; line-height: 1.2; margin: 0 0 0.25em; border-bottom: 1px solid #e0ddd5; padding-bottom: 0.4em; }
	:global(.doc-body h2) { font-size: 1.45rem; font-weight: 600; margin: 2.2em 0 0.6em; border-bottom: 1px solid #e8e5df; padding-bottom: 0.25em; }
	:global(.doc-body h3) { font-size: 1.2rem; font-weight: 600; margin: 1.8em 0 0.5em; }
	:global(.doc-body h4) { font-size: 1rem; font-weight: 600; margin: 1.5em 0 0.4em; font-style: italic; }
	:global(.doc-body p) { margin: 0 0 1.1em; }
	:global(.doc-body a) { color: var(--brand); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--brand) 25%, transparent); transition: border-color 0.1s; }
	:global(.doc-body a:hover) { border-bottom-color: var(--brand); }
	:global(.doc-body ul), :global(.doc-body ol) { padding-left: 2em; margin: 0 0 1.1em; }
	:global(.doc-body li) { margin-bottom: 0.3em; }
	:global(.doc-body blockquote) { margin: 1.5em 0; padding: 0.1em 0 0.1em 1.25em; border-left: 4px solid #d1c9b0; color: #555; font-style: italic; }
	:global(.doc-body code) { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; font-size: 0.875em; background: #f5f2eb; padding: 0.15em 0.35em; border-radius: 3px; color: #b5470d; }
	:global(.doc-body pre) { background: #1e1e1e; border-radius: 6px; padding: 1.1em 1.3em; overflow-x: auto; max-width: 100%; margin: 1.5em 0; line-height: 1.5; }
	:global(.doc-body pre code) { background: none; padding: 0; color: #d4d4d4; font-size: 0.85rem; border-radius: 0; }
	:global(.doc-body table) { width: 100%; border-collapse: collapse; margin: 1.5em 0; font-size: 0.95em; }
	:global(.doc-body th) { background: #f5f2eb; font-weight: 600; text-align: left; padding: 0.5em 0.85em; border: 1px solid #d1c9b0; }
	:global(.doc-body td) { padding: 0.45em 0.85em; border: 1px solid #e0ddd5; }
	:global(.doc-body tr:nth-child(even) td) { background: #faf9f5; }
	:global(.doc-body hr) { border: none; border-top: 1px solid #e0ddd5; margin: 2.5em 0; }
	:global(.doc-body img) { max-width: 100%; height: auto; border-radius: 4px; }

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

	@media (max-width: 640px) {
		.header-inner {
			padding: 0.85rem 1rem;
			gap: 0.65rem;
			flex-wrap: wrap;
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
