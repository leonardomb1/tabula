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
		background: #fafaf8;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: ui-sans-serif, system-ui, sans-serif;
		padding: 1rem;
	}

	.login-card {
		background: #fff;
		border: 1px solid #e0ddd5;
		border-radius: 12px;
		padding: 2.5rem 2rem;
		width: 100%;
		max-width: 360px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
	}

	.logo-wrap {
		display: flex;
		justify-content: center;
		margin-bottom: 1.75rem;
	}

	.card-title {
		font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
		font-size: 1.4rem;
		font-weight: 600;
		color: #1a1a1a;
		text-align: center;
		margin: 0 0 0.25rem;
	}

	.card-sub {
		font-size: 0.82rem;
		color: #999;
		text-align: center;
		margin: 0 0 1.75rem;
	}

	.error-msg {
		background: #fff5f5;
		border: 1px solid #fca5a5;
		color: #b91c1c;
		font-size: 0.83rem;
		padding: 0.6rem 0.85rem;
		border-radius: 6px;
		margin-bottom: 1rem;
	}

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
		color: #555;
	}

	input {
		border: 1px solid #d8d5ce;
		border-radius: 7px;
		padding: 0.55rem 0.8rem;
		font-size: 0.92rem;
		color: #1a1a1a;
		outline: none;
		background: #fafaf8;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	input:focus {
		border-color: #b0a890;
		box-shadow: 0 0 0 3px rgba(180, 165, 130, 0.18);
		background: #fff;
	}

	.submit-btn {
		margin-top: 0.25rem;
		background: var(--brand);
		color: #fff;
		border: none;
		padding: 0.65rem 1rem;
		border-radius: 7px;
		font-size: 0.92rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.sso-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.65rem 1rem;
		margin-bottom: 1rem;
		background: #fff;
		border: 1px solid #d8d5ce;
		border-radius: 7px;
		color: #1a1a1a;
		font-size: 0.92rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}
	.sso-btn:hover { background: #f5f3ee; border-color: var(--brand); }

	.sso-icon { width: 16px; height: 16px; color: var(--brand); flex-shrink: 0; }

	.sep {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		color: #aaa;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.sep::before, .sep::after {
		content: '';
		flex: 1;
		height: 1px;
		background: #e0ddd5;
	}

	.submit-btn:hover {
		background: color-mix(in srgb, var(--brand) 85%, black);
	}

	.submit-btn:active {
		background: color-mix(in srgb, var(--brand) 70%, black);
	}

	@media (max-width: 640px) {
		.login-card { padding: 2rem 1.25rem; }
		input { font-size: 16px; }
	}
</style>
