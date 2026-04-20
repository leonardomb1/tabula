<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let createId = $state('');
	let createName = $state('');
	let createBusy = $state(false);
	let createErr = $state('');

	async function createWs() {
		createBusy = true; createErr = '';
		const res = await fetch('/api/admin/workspaces', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: createId.trim(), name: createName.trim() })
		});
		createBusy = false;
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			createErr = body.message ?? `Erro ${res.status}`;
			return;
		}
		createId = ''; createName = '';
		await invalidateAll();
	}

	function fmtDate(d: Date | string) {
		return new Date(d).toLocaleDateString('pt-BR', { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<header class="section-head">
	<p class="eyebrow">Plataforma</p>
	<h1 class="title">Administração</h1>
	<p class="lede">Criar workspaces e ver o inventário global. Visível apenas para administradores.</p>
</header>

<section class="panel">
	<div class="panel-head">
		<h2>Novo workspace</h2>
		<p>O criador não é adicionado automaticamente — configure os acessos em seguida.</p>
	</div>

	<form class="create" onsubmit={(e) => { e.preventDefault(); createWs(); }}>
		<label class="fld-label" for="ws-id">ID</label>
		<label class="fld-label" for="ws-name">Nome</label>
		<span></span>

		<input
			id="ws-id"
			class="fld-input"
			type="text"
			bind:value={createId}
			placeholder="eng-docs"
			pattern="[a-z0-9-]+"
			minlength="2"
			maxlength="64"
			required
		/>
		<input
			id="ws-name"
			class="fld-input"
			type="text"
			bind:value={createName}
			placeholder="Engineering Docs"
			maxlength="120"
			required
		/>
		<button type="submit" disabled={createBusy || !createId.trim() || !createName.trim()}>
			{createBusy ? 'Criando…' : 'Criar workspace'}
		</button>

		<span class="fld-hint">Letras minúsculas, números e hífens. Não muda depois.</span>
		<span class="fld-hint">Aparece na UI. Pode ser renomeado.</span>
		<span></span>
	</form>
	{#if createErr}<p class="err">{createErr}</p>{/if}
</section>

<section class="panel">
	<div class="panel-head">
		<h2>Todos os workspaces</h2>
		<p>{data.workspaces.length} workspace{data.workspaces.length === 1 ? '' : 's'} na plataforma.</p>
	</div>

	<ul class="ws-list">
		{#each data.workspaces as w}
			<li>
				<a href="/settings/workspaces/{w.id}" class="ws-row">
					<div class="main">
						<p class="name">{w.name}</p>
						<p class="sub"><code>{w.id}</code> · criado {fmtDate(w.created_at)}</p>
					</div>
					<svg class="chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</a>
			</li>
		{/each}
	</ul>
</section>

<style>
	.section-head { margin-bottom: 32px; max-width: 780px; }

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
	}

	.lede {
		margin: 0;
		font-family: var(--font-serif-body);
		color: var(--ink-soft);
		font-size: 15px;
		font-style: italic;
	}

	.panel {
		max-width: 880px;
		margin: 0 0 28px;
		padding: 24px 24px 20px;
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: var(--surface);
	}

	.panel-head { margin-bottom: 16px; }

	.panel-head h2 {
		margin: 0 0 4px;
		font-family: var(--font-serif-display);
		font-size: 18px;
		font-weight: 500;
	}

	.panel-head p {
		margin: 0;
		font-size: 13px;
		color: var(--ink-soft);
	}

	/* 3×3 grid: row 1 labels, row 2 inputs+button (same row so the
	   button aligns with the input baseline), row 3 hints. Empty span
	   cells on col 3 in rows 1 & 3 keep the grid rectangular. */
	.create {
		display: grid;
		grid-template-columns: minmax(200px, 1fr) minmax(200px, 2fr) auto;
		grid-template-rows: auto 34px auto;
		column-gap: 14px;
		row-gap: 5px;
		align-items: center;
	}

	.fld-label {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-muted);
		font-family: var(--font-sans);
		align-self: end;
	}

	.fld-input {
		font-family: var(--font-sans);
		font-size: 13.5px;
		padding: 7px 10px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--bg);
		color: var(--ink);
		outline: 0;
		min-width: 0;
		align-self: stretch;
	}

	.fld-input:focus { border-color: var(--accent); }

	.fld-hint {
		font-size: 11px;
		color: var(--ink-muted);
		font-family: var(--font-sans);
		align-self: start;
	}

	.create button {
		padding: 0 18px;
		align-self: stretch;
		background: var(--ink);
		color: var(--bg);
		border: 1px solid var(--ink);
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.create button:disabled { opacity: 0.45; cursor: not-allowed; }

	.ws-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.ws-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 12px 10px;
		border-bottom: 1px solid var(--rule-soft);
		color: var(--ink);
	}

	.ws-list li:last-child .ws-row { border-bottom: 0; }

	.ws-row:hover { background: var(--bg-deep); }

	.main { flex: 1; min-width: 0; }

	.name {
		margin: 0 0 2px;
		font-family: var(--font-serif-display);
		font-size: 15px;
		font-weight: 500;
	}

	.sub { margin: 0; font-size: 11.5px; color: var(--ink-muted); }
	.sub code { font-family: var(--font-mono); }

	.chev { width: 14px; height: 14px; color: var(--ink-muted); flex-shrink: 0; }

	.err {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: oklch(0.55 0.18 25);
	}

	:global([data-theme='dark']) .err { color: oklch(0.78 0.16 25); }

	@media (max-width: 1024px) {
		.create { grid-template-columns: 1fr; }
	}
</style>
