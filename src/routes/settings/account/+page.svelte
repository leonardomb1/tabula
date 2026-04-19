<script lang="ts">
	import { page } from '$app/stores';

	const user = $derived(
		$page.data.user as { username: string; displayName: string; isPlatformAdmin?: boolean } | null
	);
</script>

<header class="section-head">
	<p class="eyebrow">Conta</p>
	<h1 class="title">Perfil</h1>
	<p class="lede">Dados vindos do seu login (LDAP ou OIDC). Somente leitura por aqui.</p>
</header>

{#if user}
	<dl class="profile">
		<dt>Nome</dt>
		<dd>{user.displayName}</dd>

		<dt>Usuário</dt>
		<dd><code>{user.username}</code></dd>

		<dt>Permissão</dt>
		<dd>
			{#if user.isPlatformAdmin}
				<span class="chip chip-admin">Administrador da plataforma</span>
			{:else}
				<span class="chip">Usuário</span>
			{/if}
		</dd>
	</dl>
{/if}

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

	.profile {
		display: grid;
		grid-template-columns: 160px 1fr;
		gap: 14px 28px;
		max-width: 680px;
		margin: 0;
		font-family: var(--font-sans);
	}

	.profile dt {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		align-self: center;
	}

	.profile dd {
		margin: 0;
		font-size: 14.5px;
		color: var(--ink);
	}

	.profile dd code {
		font-family: var(--font-mono);
		font-size: 12.5px;
		background: var(--code-surface);
		border: 1px solid var(--rule);
		padding: 1px 8px;
		border-radius: 4px;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--chip-bg);
		font-size: 12px;
		color: var(--ink-soft);
		font-family: var(--font-sans);
	}

	.chip-admin {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 500;
	}
</style>
