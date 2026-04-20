<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll, goto } from '$app/navigation';
	import { ROLES, type Role } from '$lib/roles';

	let { data }: { data: PageData } = $props();

	type Binding = (typeof data.bindings)[number];
	type Source = Binding['source'];

	const SOURCE_LABEL: Record<Source, string> = {
		user: 'Usuário',
		wildcard: 'Todos autenticados',
		ldap_group: 'Grupo LDAP',
		oidc_claim: 'Claim OIDC'
	};

	const ROLE_LABEL: Record<Role, string> = {
		[ROLES.VIEWER]: 'Leitor',
		[ROLES.EDITOR]: 'Editor',
		[ROLES.MAINTAINER]: 'Mantenedor'
	};

	// ── Rename ───────────────────────────────────────────────────
	// Seeded from the loader and re-synced when the user navigates to
	// a different workspace (same component, different load — `data`
	// changes but the local state doesn't refresh on its own).
	let renameValue = $state('');
	let renameBusy = $state(false);
	let renameErr = $state('');

	$effect(() => {
		renameValue = data.workspace.name;
	});

	async function rename() {
		if (!renameValue.trim() || renameValue.trim() === data.workspace.name) return;
		renameBusy = true; renameErr = '';
		const res = await fetch(`/api/admin/workspaces/${data.workspace.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: renameValue.trim() })
		});
		renameBusy = false;
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			renameErr = body.message ?? `Erro ${res.status}`;
			return;
		}
		await invalidateAll();
	}

	// ── Delete ───────────────────────────────────────────────────
	let confirmDelete = $state('');
	let deleteBusy = $state(false);
	let deleteErr = $state('');

	async function deleteWs() {
		if (confirmDelete !== data.workspace.id) return;
		deleteBusy = true; deleteErr = '';
		const res = await fetch(`/api/admin/workspaces/${data.workspace.id}`, { method: 'DELETE' });
		deleteBusy = false;
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			deleteErr = body.message ?? `Erro ${res.status}`;
			return;
		}
		await goto('/settings/workspaces');
	}

	// ── Add binding ──────────────────────────────────────────────
	let addSource = $state<Source>('user');
	let addValue = $state('');
	let addRole = $state<Role>(ROLES.EDITOR);
	let addBusy = $state(false);
	let addErr = $state('');

	const addPlaceholder = $derived.by(() => {
		switch (addSource) {
			case 'user': return 'alice@corp';
			case 'ldap_group': return 'cn=eng-team,ou=groups,dc=corp,dc=example,dc=com';
			case 'oidc_claim': return 'eng-team';
			case 'wildcard': return '*';
		}
	});

	$effect(() => {
		if (addSource === 'wildcard') addValue = '*';
	});

	async function addBinding() {
		addBusy = true; addErr = '';
		const res = await fetch(`/api/admin/workspaces/${data.workspace.id}/bindings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ source: addSource, source_value: addValue, role: addRole })
		});
		addBusy = false;
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			addErr = body.message ?? `Erro ${res.status}`;
			return;
		}
		addValue = addSource === 'wildcard' ? '*' : '';
		await invalidateAll();
	}

	async function removeBinding(b: Binding) {
		const res = await fetch(`/api/admin/workspaces/${data.workspace.id}/bindings`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ source: b.source, source_value: b.source_value })
		});
		if (!res.ok) return;
		await invalidateAll();
	}
</script>

<header class="section-head">
	<p class="eyebrow">Workspace</p>
	<h1 class="title">{data.workspace.name}</h1>
	<p class="lede"><code>{data.workspace.id}</code></p>
	<p class="back"><a href="/settings/workspaces">← Todos os workspaces</a></p>
</header>

<!-- ══════════════ Bindings ══════════════ -->
<section class="panel">
	<div class="panel-head">
		<h2>Acessos</h2>
		<p>Quem pode ver ou editar este workspace.</p>
	</div>

	<table class="bindings">
		<thead>
			<tr>
				<th>Origem</th>
				<th>Valor</th>
				<th>Função</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.bindings as b}
				<tr>
					<td><span class="src-chip src-{b.source}">{SOURCE_LABEL[b.source]}</span></td>
					<td><code class="val">{b.source_value}</code></td>
					<td><span class="role-chip role-{b.role}">{ROLE_LABEL[b.role]}</span></td>
					<td class="actions">
						<button type="button" class="icon-btn" onclick={() => removeBinding(b)} title="Remover">
							<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path d="M3 5h10M6 5V3h4v2M5 5l.5 9h5L11 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</button>
					</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="empty">Nenhum acesso configurado.</td></tr>
			{/each}
		</tbody>
	</table>

	<form class="add-row" onsubmit={(e) => { e.preventDefault(); addBinding(); }}>
		<select bind:value={addSource}>
			<option value="user">Usuário</option>
			<option value="ldap_group">Grupo LDAP</option>
			<option value="oidc_claim">Claim OIDC</option>
			<option value="wildcard">Todos autenticados</option>
		</select>
		<input
			type="text"
			bind:value={addValue}
			placeholder={addPlaceholder}
			disabled={addSource === 'wildcard'}
			required
		/>
		<select bind:value={addRole}>
			<option value={ROLES.VIEWER}>Leitor</option>
			<option value={ROLES.EDITOR}>Editor</option>
			<option value={ROLES.MAINTAINER}>Mantenedor</option>
		</select>
		<button type="submit" class="add-btn" disabled={addBusy || !addValue.trim()}>
			{addBusy ? '…' : 'Adicionar'}
		</button>
	</form>
	{#if addErr}<p class="err">{addErr}</p>{/if}
</section>

<!-- ══════════════ Rename ══════════════ -->
<section class="panel">
	<div class="panel-head">
		<h2>Nome</h2>
		<p>Renomear não muda o <code>id</code> nem as URLs.</p>
	</div>
	<form class="inline-form" onsubmit={(e) => { e.preventDefault(); rename(); }}>
		<input type="text" bind:value={renameValue} maxlength="120" required />
		<button type="submit" disabled={renameBusy || !renameValue.trim() || renameValue.trim() === data.workspace.name}>
			{renameBusy ? 'Salvando…' : 'Salvar'}
		</button>
	</form>
	{#if renameErr}<p class="err">{renameErr}</p>{/if}
</section>

<!-- ══════════════ Delete ══════════════ -->
<section class="panel danger">
	<div class="panel-head">
		<h2>Excluir workspace</h2>
		<p>Isto remove o workspace e todos os seus acessos. Documentos no storage permanecem.</p>
	</div>
	<form class="inline-form" onsubmit={(e) => { e.preventDefault(); deleteWs(); }}>
		<input
			type="text"
			bind:value={confirmDelete}
			placeholder={`Digite "${data.workspace.id}" para confirmar`}
		/>
		<button type="submit" class="danger-btn" disabled={deleteBusy || confirmDelete !== data.workspace.id}>
			{deleteBusy ? 'Excluindo…' : 'Excluir'}
		</button>
	</form>
	{#if deleteErr}<p class="err">{deleteErr}</p>{/if}
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

	.lede { margin: 0 0 8px; }
	.lede code {
		font-family: var(--font-mono);
		font-size: 12.5px;
		background: var(--code-surface);
		border: 1px solid var(--rule);
		padding: 1px 8px;
		border-radius: 4px;
	}

	.back { margin: 0; font-size: 13px; }
	.back a { color: var(--ink-muted); }
	.back a:hover { color: var(--accent-ink); }

	.panel {
		max-width: 880px;
		margin: 0 0 28px;
		padding: 24px 24px 20px;
		border: 1px solid var(--rule);
		border-radius: 10px;
		background: var(--surface);
	}

	.panel.danger {
		border-color: color-mix(in oklab, oklch(0.55 0.18 25) 40%, var(--rule));
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

	.panel-head p code {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--ink);
		background: var(--bg-deep);
		padding: 1px 5px;
		border-radius: 3px;
	}

	.bindings {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-sans);
		margin-bottom: 14px;
	}

	.bindings th {
		text-align: left;
		padding: 8px 10px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
		border-bottom: 1px solid var(--rule);
	}

	.bindings td {
		padding: 10px 10px;
		border-bottom: 1px solid var(--rule-soft);
		font-size: 13.5px;
		vertical-align: middle;
	}

	.bindings tr:last-child td { border-bottom: 0; }

	.bindings .val {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--ink-soft);
		overflow-wrap: anywhere;
	}

	.src-chip, .role-chip {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 11px;
		background: var(--chip-bg);
		color: var(--ink-soft);
	}

	.role-chip.role-editor { background: var(--accent-soft); color: var(--accent-ink); }
	.role-chip.role-maintainer {
		background: var(--accent-soft);
		color: var(--accent-ink);
		font-weight: 500;
	}

	.actions { text-align: right; width: 1%; white-space: nowrap; }

	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: 1px solid transparent;
		background: transparent;
		border-radius: 5px;
		color: var(--ink-muted);
		cursor: pointer;
	}

	.icon-btn:hover {
		border-color: var(--rule);
		color: oklch(0.55 0.18 25);
		background: var(--bg-deep);
	}

	.empty {
		text-align: center;
		font-style: italic;
		color: var(--ink-muted);
		font-family: var(--font-serif-body);
		padding: 24px !important;
	}

	.add-row {
		display: grid;
		grid-template-columns: 160px 1fr 140px auto;
		gap: 8px;
		padding-top: 14px;
		border-top: 1px solid var(--rule);
	}

	.inline-form {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}

	.inline-form input { flex: 1; min-width: 220px; }

	.add-row input,
	.add-row select,
	.inline-form input {
		font-family: var(--font-sans);
		font-size: 13.5px;
		padding: 7px 10px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--bg);
		color: var(--ink);
		outline: 0;
		min-width: 0;
	}

	.add-row select { font-size: 13px; }
	.add-row input:focus, .add-row select:focus, .inline-form input:focus {
		border-color: var(--accent);
	}

	.add-row input:disabled { opacity: 0.5; background: var(--bg-deep); }

	.add-btn, .inline-form button {
		padding: 7px 16px;
		background: var(--ink);
		color: var(--bg);
		border: 1px solid var(--ink);
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
	}

	.add-btn:disabled, .inline-form button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.danger-btn {
		background: oklch(0.55 0.18 25) !important;
		border-color: oklch(0.55 0.18 25) !important;
		color: #fff !important;
	}

	.danger-btn:disabled { background: var(--rule) !important; border-color: var(--rule) !important; color: var(--ink-muted) !important; }

	.err {
		margin: 10px 0 0;
		font-size: 12.5px;
		color: oklch(0.55 0.18 25);
	}

	:global([data-theme='dark']) .err { color: oklch(0.78 0.16 25); }

	@media (max-width: 1024px) {
		.add-row {
			grid-template-columns: 1fr;
		}
	}
</style>
