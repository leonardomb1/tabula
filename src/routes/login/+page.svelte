<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import BrandLogo from "$lib/BrandLogo.svelte";
	import type { ActionData, PageData } from './$types';
	let { form, data }: { form: ActionData; data: PageData } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Entrar — Docs</title>
</svelte:head>

<div class="login-page">
	<div class="login-card">
		<div class="logo-wrap">
			<BrandLogo height={32} href="/" />
		</div>

		<h1 class="card-title">{data.branding.name}</h1>
		<p class="card-sub">
			{data.ldap ? 'Entre com suas credenciais de rede' : 'Entre para continuar'}
		</p>

		{#if data.oidc}
			<a class="sso-btn" href="/auth/oidc/login{$page.url.searchParams.get('redirect') ? `?redirect=${encodeURIComponent($page.url.searchParams.get('redirect')!)}` : ''}">
				<svg class="sso-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
					<polyline points="10 17 15 12 10 7"/>
					<line x1="15" y1="12" x2="3" y2="12"/>
				</svg>
				Entrar com SSO
			</a>

			<div class="sep"><span>ou</span></div>
		{/if}

		<form method="POST" class="login-form" use:enhance={() => {
			loading = true;
			return async ({ update }) => { loading = false; update(); };
		}}>
			{#if form?.error}
				<div class="error-msg" role="alert">{form.error}</div>
			{/if}

			<div class="field">
				<label for="username">Usuário</label>
				<input
					id="username"
					name="username"
					type="text"
					value={form?.username ?? ''}
					autocomplete="username"
					autocapitalize="off"
					spellcheck="false"
					required
				/>
			</div>

			<div class="field">
				<label for="password">Senha</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					required
				/>
			</div>

			<button type="submit" class="submit-btn" disabled={loading}>
				{loading ? 'Verificando…' : 'Entrar'}
			</button>
		</form>
	</div>
</div>

<style>
	.login-page {
		min-height: 100vh;
		background: var(--bg);
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-sans);
		padding: 1rem;
	}

	.login-card {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 12px;
		padding: 2.5rem 2rem;
		width: 100%;
		max-width: 360px;
		box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.1);
	}

	.logo-wrap {
		display: flex;
		justify-content: center;
		margin-bottom: 1.75rem;
	}

	.card-title {
		font-family: var(--font-serif-display);
		font-size: 1.4rem;
		font-weight: 500;
		color: var(--ink);
		text-align: center;
		margin: 0 0 0.25rem;
	}

	.card-sub {
		font-size: 0.82rem;
		color: var(--ink-muted);
		text-align: center;
		margin: 0 0 1.75rem;
	}

	.error-msg {
		background: color-mix(in oklab, oklch(0.6 0.18 25) 12%, transparent);
		border: 1px solid color-mix(in oklab, oklch(0.6 0.18 25) 40%, transparent);
		color: oklch(0.5 0.18 25);
		font-size: 0.83rem;
		padding: 0.6rem 0.85rem;
		border-radius: 6px;
		margin-bottom: 1rem;
	}

	:global([data-theme='dark']) .error-msg { color: oklch(0.78 0.16 25); }

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label {
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--ink-soft);
	}

	input {
		border: 1px solid var(--rule);
		border-radius: 7px;
		padding: 0.55rem 0.8rem;
		font-size: 0.92rem;
		color: var(--ink);
		outline: none;
		background: var(--bg);
		transition: border-color 0.15s, box-shadow 0.15s;
		font-family: inherit;
	}

	input:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
		background: var(--surface);
	}

	.submit-btn {
		margin-top: 0.25rem;
		background: var(--accent);
		color: #fff;
		border: none;
		padding: 0.65rem 1rem;
		border-radius: 7px;
		font-size: 0.92rem;
		font-weight: 500;
		cursor: pointer;
		transition: filter 0.15s;
	}

	.sso-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.65rem 1rem;
		margin-bottom: 1rem;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 7px;
		color: var(--ink);
		font-size: 0.92rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.sso-btn:hover { background: var(--bg-deep); border-color: var(--accent); }

	.sso-icon { width: 16px; height: 16px; color: var(--accent); flex-shrink: 0; }

	.sep {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		color: var(--ink-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.sep::before, .sep::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--rule);
	}

	.submit-btn:hover { filter: brightness(1.08); }
	.submit-btn:active { filter: brightness(0.92); }

	@media (max-width: 640px) {
		.login-card { padding: 2rem 1.25rem; }
		input { font-size: 16px; }
	}
</style>
