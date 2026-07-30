<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages';
	import { workspaceHref } from '$lib/nav';
	import { dur } from '$lib/motion';

	interface WorkspaceRef {
		id: string;
		name: string;
		kind: string;
		role: string | null;
	}

	let {
		open = $bindable(false),
		workspaces = [],
		currentId = ''
	}: { open?: boolean; workspaces?: WorkspaceRef[]; currentId?: string } = $props();

	let filter = $state('');
	let cursor = $state(0);
	let input = $state<HTMLInputElement | null>(null);

	const matches = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return workspaces;
		return workspaces.filter((w) => w.name.toLowerCase().includes(q) || w.id.includes(q));
	});

	$effect(() => {
		if (open) input?.focus();
	});

	function hueFor(id: string): number {
		let h = 0x811c9dc5;
		for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
		return (h >>> 0) % 360;
	}

	const kindLabel: Record<string, () => string> = {
		team: m.workspace_kind_team,
		personal: m.workspace_kind_personal,
		system: m.workspace_kind_system
	};

	function close() {
		open = false;
		filter = '';
		cursor = 0;
	}

	async function pick(ws: WorkspaceRef) {
		close();
		if (ws.id === currentId) return;
		await goto(workspaceHref(ws.id), { invalidateAll: true });
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			close();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			cursor = matches.length === 0 ? 0 : (cursor + 1) % matches.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			cursor = matches.length === 0 ? 0 : (cursor - 1 + matches.length) % matches.length;
		} else if (event.key === 'Enter' && matches[cursor]) {
			event.preventDefault();
			pick(matches[cursor]);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="scrim" transition:fade={{ duration: dur(140) }} onclick={close}></div>

	<div class="wrap">
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-label={m.workspace_switch()}
			transition:scale={{ duration: dur(160), start: 0.97, easing: cubicOut }}
		>
			<div class="field">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-3.5-3.5" />
				</svg>
				<input
					bind:this={input}
					bind:value={filter}
					oninput={() => (cursor = 0)}
					type="text"
					placeholder={m.workspace_filter()}
					autocomplete="off"
					spellcheck="false"
				/>
				<span class="kbd">esc</span>
			</div>

			<ul class="list">
				{#each matches as ws, i (ws.id)}
					<li>
						<button
							type="button"
							class="item"
							class:active={i === cursor}
							onmouseenter={() => (cursor = i)}
							onclick={() => pick(ws)}
						>
							<span class="badge" style="background: oklch(0.58 0.13 {hueFor(ws.id)})">
								{[...ws.name][0]?.toUpperCase() ?? '?'}
							</span>
							<span class="main">
								<span class="name">{ws.name}</span>
								<span class="meta">
									{(kindLabel[ws.kind] ?? m.workspace_kind_team)()}
									{#if ws.role}· {ws.role}{/if}
								</span>
							</span>
							{#if ws.id === currentId}
								<svg class="check" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="m5 12.5 4.5 4.5L19 7" />
								</svg>
							{/if}
						</button>
					</li>
				{:else}
					<li class="empty">{m.workspace_none()}</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: rgb(0 0 0 / 0.45);
	}

	.wrap {
		position: fixed;
		inset: 0;
		z-index: 51;
		display: grid;
		place-items: start center;
		padding: 12vh 24px 24px;
		pointer-events: none;
	}

	.panel {
		pointer-events: auto;
		width: min(440px, 100%);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		box-shadow: var(--shadow);
		overflow: hidden;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 14px;
		border-bottom: 1px solid var(--border);
		color: var(--text-faint);
	}
	.field input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		font-size: 14px;
		outline: none;
	}
	.kbd {
		flex: none;
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-radius: 4px;
		font-size: 10.5px;
	}

	.list {
		margin: 0;
		padding: 6px;
		list-style: none;
		max-height: min(50vh, 420px);
		overflow-y: auto;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 8px;
		border: 0;
		border-radius: var(--radius-sm);
		background: none;
		text-align: start;
		cursor: pointer;
		transition: background-color 120ms ease;
	}
	.item.active {
		background: var(--surface-hover);
	}

	.badge {
		flex: none;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 6px;
		color: #fff;
		font-size: 11.5px;
		font-weight: 700;
	}

	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13.5px;
		color: var(--text);
	}

	.meta {
		font-size: 11px;
		color: var(--text-faint);
	}

	.check {
		flex: none;
		color: var(--brand);
	}

	.empty {
		padding: 16px 10px;
		text-align: center;
		font-size: 13px;
		color: var(--text-faint);
	}
</style>
