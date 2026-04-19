<script lang="ts">
	import { page } from '$app/stores';
	import BrandLogo from '$lib/BrandLogo.svelte';

	// SvelteKit populates $page.status and $page.error for any uncaught
	// error or explicit error() throw from a load function. One component
	// handles 404, 403, 500 — the copy switches on status; the shell
	// matches the Atelier masthead vocabulary used on /, /public, /settings.

	type Copy = { eyebrow: string; title: string; lede: string };

	const copy = $derived.by<Copy>(() => {
		const s = $page.status;
		if (s === 404) {
			return {
				eyebrow: 'Não encontrado',
				title: 'Esta página não existe',
				lede: 'O documento, workspace ou rota que você procurou saiu do ar — ou talvez nunca tenha existido.'
			};
		}
		if (s === 401) {
			return {
				eyebrow: 'Autenticação necessária',
				title: 'Entre para continuar',
				lede: 'Esta parte do workspace exige login.'
			};
		}
		if (s === 403) {
			return {
				eyebrow: 'Acesso negado',
				title: 'Sem permissão',
				lede: 'Sua conta não tem acesso a este workspace ou ação. Fale com um administrador se acha que é engano.'
			};
		}
		return {
			eyebrow: `Erro ${s}`,
			title: 'Algo quebrou',
			lede: 'Um erro inesperado aconteceu no servidor. Tente novamente em instantes — se persistir, avise a equipe.'
		};
	});

	const detail = $derived(($page.error?.message ?? '').trim());
	const showBack = $derived(typeof window !== 'undefined' && window.history.length > 1);
</script>

<svelte:head>
	<title>{copy.eyebrow} · {$page.status}</title>
</svelte:head>

<div class="shell">
	<header class="top-bar">
		<a class="brand" href="/" aria-label="Voltar à página inicial">
			<BrandLogo height={26} />
		</a>
	</header>

	<main class="stage">
		<p class="eyebrow">{copy.eyebrow}</p>
		<p class="code" aria-hidden="true">{$page.status}</p>
		<h1 class="title">{copy.title}</h1>
		<p class="lede">{copy.lede}</p>

		{#if detail}
			<!-- Small technical line for operators — never load-bearing;
			     users can safely ignore. Shown in monospace so it's
			     visually distinct from the prose copy. -->
			<p class="detail"><code>{detail}</code></p>
		{/if}

		<div class="actions">
			<a href="/" class="btn primary">Voltar ao início</a>
			{#if showBack}
				<button type="button" class="btn" onclick={() => history.back()}>Página anterior</button>
			{/if}
		</div>
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
		background: var(--bg);
		color: var(--ink);
		display: flex;
		flex-direction: column;
	}

	.top-bar {
		max-width: 1520px;
		margin: 0 auto;
		padding: 0 28px;
		width: 100%;
		height: 56px;
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--rule);
	}

	.brand {
		display: inline-flex;
		align-items: center;
	}

	.stage {
		flex: 1;
		max-width: 720px;
		width: 100%;
		margin: 0 auto;
		padding: 96px 28px 120px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.eyebrow {
		margin: 0 0 12px;
		font-family: var(--font-sans);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}

	/* Oversized status number — serif display at a Didone-ish setting,
	   muted so it anchors the page without shouting. */
	.code {
		margin: 0 0 18px;
		font-family: var(--font-serif-display);
		font-size: 120px;
		font-weight: 500;
		line-height: 0.95;
		letter-spacing: -0.04em;
		color: var(--ink-muted);
		font-variation-settings: 'opsz' 120;
	}

	.title {
		margin: 0 0 14px;
		font-family: var(--font-serif-display);
		font-size: 40px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
		color: var(--ink);
	}

	.lede {
		margin: 0 0 32px;
		max-width: 560px;
		font-family: var(--font-serif-body);
		font-size: 17px;
		line-height: 1.55;
		color: var(--ink-soft);
		font-style: italic;
		text-wrap: pretty;
	}

	.detail {
		margin: -14px 0 32px;
		max-width: 560px;
	}

	.detail code {
		display: inline-block;
		padding: 6px 10px;
		background: var(--code-surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--ink-soft);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		height: 36px;
		padding: 0 18px;
		border: 1px solid var(--rule);
		background: var(--surface);
		color: var(--ink);
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 13.5px;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
	}

	.btn:hover {
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.btn.primary {
		background: var(--ink);
		color: var(--bg);
		border-color: var(--ink);
	}

	.btn.primary:hover {
		background: oklch(0.3 0.015 80);
		border-color: transparent;
		color: var(--bg);
	}

	@media (max-width: 640px) {
		.top-bar { padding: 10px 14px; height: auto; }
		.stage { padding: 48px 20px 80px; }
		.code { font-size: 88px; }
		.title { font-size: 32px; }
		.lede { font-size: 15.5px; }
	}
</style>
