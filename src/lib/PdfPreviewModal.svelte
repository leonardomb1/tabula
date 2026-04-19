<script lang="ts">
	import { onDestroy } from 'svelte';

	interface Props {
		open: boolean;
		slug: string;
		wsId: string;
		onClose: () => void;
	}

	let { open, slug, wsId, onClose }: Props = $props();

	let blobUrl = $state<string | null>(null);
	let loading = $state(false);
	let errorMsg = $state('');
	let downloading = $state(false);

	function disposeBlob() {
		if (blobUrl) {
			URL.revokeObjectURL(blobUrl);
			blobUrl = null;
		}
	}

	async function fetchPreview() {
		loading = true;
		errorMsg = '';
		try {
			const res = await fetch(`/api/export/${slug}?format=pdf-preview&ws=${wsId}`);
			if (!res.ok) {
				errorMsg = res.status === 403
					? 'Apenas documentos com `formal: true` podem ser pré-visualizados.'
					: 'Erro ao gerar pré-visualização';
				return;
			}
			const blob = await res.blob();
			disposeBlob();
			blobUrl = URL.createObjectURL(blob);
		} catch {
			errorMsg = 'Erro ao gerar pré-visualização';
		} finally {
			loading = false;
		}
	}

	async function downloadFull() {
		if (downloading) return;
		downloading = true;
		errorMsg = '';
		try {
			const res = await fetch(`/api/export/${slug}?format=pdf&ws=${wsId}`);
			if (!res.ok) {
				errorMsg = 'Erro ao gerar PDF';
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${slug}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			errorMsg = 'Erro ao gerar PDF';
		} finally {
			downloading = false;
		}
	}

	$effect(() => {
		if (open) fetchPreview();
		else disposeBlob();
	});

	onDestroy(disposeBlob);

	function handleKey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Pré-visualização PDF"
		onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
		tabindex="-1"
	>
		<div class="modal">
			<header class="modal-header">
				<h2>Pré-visualização</h2>
				<div class="header-actions">
					<button class="download-btn" onclick={downloadFull} disabled={downloading}>
						{#if downloading}
							<span class="spinner"></span> Gerando…
						{:else}
							↓ Baixar PDF
						{/if}
					</button>
					<button class="close-btn" onclick={onClose} aria-label="Fechar">✕</button>
				</div>
			</header>

			<div class="modal-body">
				{#if errorMsg}
					<div class="error">{errorMsg}</div>
				{:else if loading && !blobUrl}
					<div class="loading">
						<span class="spinner"></span> Renderizando…
					</div>
				{:else if blobUrl}
					<!-- Browser's native PDF viewer handles page nav, zoom, search. -->
					<iframe src={blobUrl} title="Pré-visualização PDF"></iframe>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 9999;
		padding: 2rem;
	}

	.modal {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		width: min(900px, 100%);
		height: min(900px, 100%);
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		overflow: hidden;
		max-width: 100%;
		max-height: 100%;
	}

	/* Phones: full-screen, rounded corners dropped so the modal
	   doesn't get squeezed by the 2rem backdrop padding (which
	   would make the iframe viewer too small to use). The iframe
	   still fills 100% of its parent. */
	@media (max-width: 640px) {
		.backdrop { padding: 0; }
		.modal {
			width: 100%;
			height: 100%;
			border: 0;
			border-radius: 0;
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--rule);
		background: var(--bg-deep);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--ink);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.download-btn {
		background: var(--accent);
		border: none;
		color: #fff;
		padding: 0.4rem 0.85rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 500;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.download-btn:hover:not(:disabled) { filter: brightness(1.08); }
	.download-btn:disabled { opacity: 0.6; cursor: not-allowed; }

	.download-btn .spinner {
		border-color: rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.2rem;
		cursor: pointer;
		color: var(--ink-muted);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.close-btn:hover { background: var(--bg); color: var(--ink); }

	/* Deliberately hard-coded: the PDF viewport sits on a dark neutral
	   backdrop regardless of theme so the paper itself pops. */
	.modal-body {
		flex: 1;
		position: relative;
		background: #2a2a2a;
		overflow: hidden;
	}

	.modal-body iframe {
		width: 100%;
		height: 100%;
		border: none;
		display: block;
	}

	.loading, .error {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		color: #eee;
		font-size: 0.9rem;
	}

	.error { color: #ffb4b4; }

	.spinner {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.25);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }
</style>
