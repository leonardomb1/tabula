<script lang="ts">
	import { marked } from 'marked';

	let { currentSlug = null }: { currentSlug?: string | null } = $props();

	let open = $state(false);
	let maximized = $state(false);
	let lastQ = $state('');
	let question = $state('');
	let streaming = $state(false);
	let errMsg = $state('');
	let bodyEl: HTMLDivElement;

	type Ref = { slug: string; quote: string };
	type Message = { role: 'user' | 'assistant'; content: string; refs?: Ref[] };
	let messages = $state<Message[]>([]);
	let streamingContent = $state('');

	function parseRefs(text: string): { body: string; refs: Ref[] } {
		const allRefs: Ref[] = [];
		const seen = new Set<string>();

		// Strip ALL REFS:[...] occurrences (model may emit multiple inline citations)
		const body = text
			.replace(/REFS:\[[^\]]*\]/g, (match) => {
				try {
					const refs: Ref[] = JSON.parse(match.slice('REFS:'.length));
					for (const r of refs) {
						const key = `${r.slug}::${r.quote}`;
						if (!seen.has(key)) { seen.add(key); allRefs.push(r); }
					}
				} catch { /* ignore malformed REFS */ }
				return '';
			})
			.replace(/\n{3,}/g, '\n\n')
			.trim();

		return { body, refs: allRefs };
	}

	function citationHref(slug: string, quote: string) {
		return `/${slug}?highlight=${encodeURIComponent(quote)}`;
	}

	const MAX_HISTORY = 10; // 5 exchanges

	async function fetchAI(q: string) {
		streaming = true;
		errMsg = '';
		streamingContent = '';
		lastQ = q;

		const historyToSend = messages.slice(-MAX_HISTORY - 1, -1);

		try {
			const res = await fetch('/api/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: q, currentSlug, history: historyToSend })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				errMsg = data.message ?? `Erro ${res.status}`;
				return;
			}

			const reader = res.body!.getReader();
			const dec = new TextDecoder();
			let streamErr = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				for (const line of dec.decode(value).split('\n')) {
					if (!line.startsWith('data: ')) continue;
					const payload = line.slice(6);
					if (payload === '[DONE]') break;
					try {
						const parsed = JSON.parse(payload);
						if (parsed.text) {
							streamingContent += parsed.text;
							setTimeout(() => bodyEl?.scrollTo({ top: bodyEl.scrollHeight }), 0);
						}
						if (parsed.error) streamErr = parsed.error;
					} catch { /* ignore */ }
				}
			}

			if (streamErr) {
				errMsg = streamErr;
			} else if (streamingContent) {
				const { body, refs } = parseRefs(streamingContent);
				messages = [...messages, { role: 'assistant', content: body, refs }];
				if (messages.length > MAX_HISTORY) messages = messages.slice(-MAX_HISTORY);
			}
			streamingContent = '';
		} catch (e) {
			errMsg = e instanceof Error ? e.message : 'Falha na conexão';
		} finally {
			streaming = false;
		}
	}

	async function retry() {
		if (!lastQ || streaming) return;
		// Remove last user message so ask() can re-add it cleanly
		messages = messages.slice(0, -1);
		errMsg = '';
		messages = [...messages, { role: 'user', content: lastQ }];
		await fetchAI(lastQ);
	}

	async function ask() {
		if (!question.trim() || streaming) return;
		const q = question.trim();
		question = '';
		messages = [...messages, { role: 'user', content: q }];
		await fetchAI(q);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
	}

	function toggle() {
		open = !open;
		if (open) setTimeout(() => document.querySelector<HTMLTextAreaElement>('.ai-input')?.focus(), 150);
	}

	function clearChat() {
		messages = [];
		streamingContent = '';
		errMsg = '';
	}

	function renderMd(text: string): string {
		return marked.parse(text) as string;
	}

</script>

<!-- Backdrop -->
{#if open}
	<div class="ai-backdrop" onclick={() => (open = false)} onkeydown={() => (open = false)} role="presentation" aria-hidden="true"></div>
{/if}

<!-- FAB -->
<button class="ai-fab" onclick={toggle} title="Perguntar ao AI" aria-label="Abrir assistente AI">
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
	</svg>
	AI
</button>

<!-- Panel -->
<div class="ai-panel" class:open class:maximized>
	<div class="ai-header">
		<span class="ai-title">
			{currentSlug ? `Contexto: ${currentSlug}` : 'Perguntar sobre os documentos'}
		</span>
		<div class="ai-header-actions">
			{#if messages.length > 0}
				<button class="ai-clear" onclick={clearChat} title="Nova conversa">↺</button>
			{/if}
			<button class="ai-maximize" onclick={() => (maximized = !maximized)} title={maximized ? 'Restaurar' : 'Expandir'} aria-label={maximized ? 'Restaurar' : 'Expandir'}>
				{#if maximized}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
				{:else}
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
				{/if}
			</button>
			<button class="ai-close" onclick={() => (open = false)} aria-label="Fechar">✕</button>
		</div>
	</div>

	<div class="ai-body" bind:this={bodyEl}>
		{#if messages.length === 0 && !streaming && !streamingContent}
			<p class="ai-placeholder">Faça uma pergunta sobre qualquer documento.</p>
		{:else}
			{#each messages as msg}
				{#if msg.role === 'user'}
					<div class="ai-msg ai-msg-user">
						{msg.content}
					</div>
				{:else}
					<div class="ai-msg ai-msg-assistant">
						<div class="ai-answer">{@html renderMd(msg.content)}</div>
						{#if msg.refs && msg.refs.length > 0}
							<div class="ai-refs">
								{#each msg.refs as ref}
									<a
										href={citationHref(ref.slug, ref.quote)}
										class="ai-ref-chip"
										target="_blank"
										rel="noopener"
										title={ref.quote}
									>
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
										/{ref.slug}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			{/each}
			{#if streamingContent}
				<div class="ai-msg ai-msg-assistant">
					<div class="ai-answer">{@html renderMd(streamingContent)}<span class="ai-cursor">▋</span></div>
				</div>
			{:else if streaming}
				<div class="ai-msg ai-msg-assistant ai-thinking">
					<span></span><span></span><span></span>
				</div>
			{/if}
		{/if}
		{#if errMsg}
			<div class="ai-error-row">
				<span class="ai-error">{errMsg}</span>
				{#if lastQ}
					<button class="ai-retry" onclick={retry} disabled={streaming}>Tentar novamente</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="ai-footer">
		<div class="ai-input-wrap">
			<textarea
				class="ai-input"
				bind:value={question}
				onkeydown={handleKeydown}
				placeholder="Ex: Como configurar o LDAP?"
				rows="2"
				disabled={streaming}
				spellcheck="false"
				autocomplete="off"
			></textarea>
		</div>
		<button class="ai-send" onclick={ask} disabled={streaming || !question.trim()} aria-label="Enviar">
			{#if streaming}
				<span class="ai-spinner"></span>
			{:else}
				→
			{/if}
		</button>
	</div>
</div>

<style>
	/* ── Backdrop ── */
	.ai-backdrop {
		position: fixed;
		inset: 0;
		z-index: 98;
	}

	/* ── FAB ── */
	.ai-fab {
		position: fixed;
		bottom: 1.25rem;
		left: 1.25rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 999px;
		padding: 0.45rem 0.9rem 0.45rem 0.7rem;
		font-size: 0.82rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
		transition: background 0.15s;
		z-index: 100;
	}
	.ai-fab:hover { background: var(--brand); }

	/* ── Panel ── */
	.ai-panel {
		position: fixed;
		bottom: 4.5rem;
		left: 1.25rem;
		width: 380px;
		max-width: calc(100vw - 2.5rem);
		max-height: min(650px, calc(100vh - 6rem));
		background: #fff;
		border: 1px solid #e0ddd5;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
		display: flex;
		flex-direction: column;
		font-family: ui-sans-serif, system-ui, sans-serif;
		z-index: 99;
		opacity: 0;
		transform: translateY(12px);
		pointer-events: none;
		transition: opacity 0.15s, transform 0.15s;
	}
	.ai-panel.open {
		opacity: 1;
		transform: translateY(0);
		pointer-events: all;
	}
	.ai-panel.maximized {
		width: min(760px, calc(100vw - 2.5rem));
		max-height: calc(100vh - 7rem);
	}

	/* ── Header ── */
	.ai-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e0ddd5;
		flex-shrink: 0;
	}
	.ai-title {
		font-size: 0.82rem;
		font-weight: 600;
		color: #1a1a1a;
	}
	.ai-header-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.ai-clear {
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		font-size: 1rem;
		padding: 0.1rem 0.3rem;
		line-height: 1;
		transition: color 0.1s;
		border-radius: 4px;
	}
	.ai-clear:hover { color: #1a1a1a; }
	.ai-maximize {
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		padding: 0.1rem 0.3rem;
		line-height: 1;
		display: flex;
		align-items: center;
		transition: color 0.1s;
		border-radius: 4px;
	}
	.ai-maximize:hover { color: #1a1a1a; }
	.ai-close {
		background: none;
		border: none;
		color: #aaa;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0.1rem 0.3rem;
		line-height: 1;
		transition: color 0.1s;
	}
	.ai-close:hover { color: var(--brand); }

	/* ── Body ── */
	.ai-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ai-placeholder {
		color: #aaa;
		font-size: 0.85rem;
		margin: 0;
		padding: 0.25rem;
	}
	.ai-error-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		flex-shrink: 0;
	}
	.ai-error {
		color: var(--brand);
		font-size: 0.82rem;
	}
	.ai-retry {
		background: none;
		border: 1px solid var(--brand);
		color: var(--brand);
		border-radius: 4px;
		padding: 0.2rem 0.55rem;
		font-size: 0.78rem;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.1s, color 0.1s;
	}
	.ai-retry:hover:not(:disabled) { background: var(--brand); color: #fff; }
	.ai-retry:disabled { opacity: 0.5; cursor: default; }

	/* ── Messages ── */
	.ai-msg {
		max-width: 92%;
		flex-shrink: 0;
		padding: 0.55rem 0.75rem;
		border-radius: 10px;
		font-size: 0.875rem;
		line-height: 1.55;
	}
	.ai-msg-user {
		align-self: flex-end;
		background: #1a1a1a;
		color: #fff;
		border-bottom-right-radius: 3px;
	}
	.ai-msg-assistant {
		align-self: flex-start;
		background: #f5f3ee;
		color: #1a1a1a;
		border-bottom-left-radius: 3px;
		max-width: 96%;
		min-width: 0;
		overflow-x: hidden;
	}

	/* Typing indicator */
	.ai-thinking {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0.7rem 0.9rem;
	}
	.ai-thinking span {
		width: 6px;
		height: 6px;
		background: #aaa;
		border-radius: 50%;
		animation: bounce 1.2s ease-in-out infinite;
	}
	.ai-thinking span:nth-child(2) { animation-delay: 0.2s; }
	.ai-thinking span:nth-child(3) { animation-delay: 0.4s; }
	@keyframes bounce { 0%, 80%, 100% { transform: scale(0.7); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }

	/* Markdown inside assistant messages */
	.ai-answer { font-size: 0.875rem; line-height: 1.6; overflow-wrap: break-word; word-break: break-word; min-width: 0; }
	.ai-answer :global(p) { margin: 0 0 0.5em; }
	.ai-answer :global(p:last-child) { margin-bottom: 0; }
	.ai-answer :global(ul), .ai-answer :global(ol) { margin: 0 0 0.5em; padding-left: 1.3em; }
	.ai-answer :global(li) { margin-bottom: 0.15em; }
	.ai-answer :global(code) {
		background: #e8e5de;
		padding: 0.1em 0.3em;
		border-radius: 3px;
		font-size: 0.82em;
		font-family: ui-monospace, monospace;
		word-break: break-all;
	}
	.ai-answer :global(pre) {
		background: #e8e5de;
		padding: 0.65em 0.85em;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0 0 0.5em;
		max-width: 100%;
	}
	.ai-answer :global(pre code) { background: none; padding: 0; word-break: normal; }
	.ai-answer :global(strong) { font-weight: 600; }
	.ai-answer :global(a) { color: var(--brand); word-break: break-all; }
	.ai-answer :global(h1), .ai-answer :global(h2), .ai-answer :global(h3) {
		font-size: 0.9em;
		font-weight: 700;
		margin: 0.5em 0 0.25em;
	}
	.ai-answer :global(table) { border-collapse: collapse; width: 100%; font-size: 0.82em; display: block; overflow-x: auto; }
	.ai-answer :global(th), .ai-answer :global(td) { border: 1px solid #d0ccc5; padding: 0.3em 0.5em; text-align: left; white-space: nowrap; }
	.ai-answer :global(th) { background: #e8e5de; font-weight: 600; }
	.ai-answer :global(img) { max-width: 100%; height: auto; }

	/* ── Citation refs ── */
	.ai-refs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid #e0ddd5;
	}
	.ai-ref-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.2em 0.55em;
		background: #fff;
		border: 1px solid #e0ddd5;
		border-radius: 4px;
		font-size: 0.72rem;
		font-family: ui-monospace, monospace;
		color: #555;
		text-decoration: none;
		transition: border-color 0.1s, color 0.1s;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ai-ref-chip:hover {
		border-color: var(--brand);
		color: var(--brand);
	}

	.ai-cursor {
		display: inline-block;
		animation: blink 0.8s steps(1) infinite;
		color: #aaa;
		margin-left: 1px;
	}
	@keyframes blink { 50% { opacity: 0; } }

	/* ── Footer ── */
	.ai-footer {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		padding: 0.75rem;
		border-top: 1px solid #e0ddd5;
		flex-shrink: 0;
	}
	.ai-input-wrap {
		flex: 1;
		position: relative;
		border: 1px solid #e0ddd5;
		border-radius: 6px;
		background: #fafaf8;
		transition: border-color 0.1s;
	}
	.ai-input-wrap:focus-within { border-color: #1a1a1a; }

	.ai-input {
		flex: 1;
		width: 100%;
		border: none;
		border-radius: 6px;
		padding: 0.5rem 0.65rem;
		font-size: 0.84rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		resize: none;
		color: #1a1a1a;
		background: transparent;
		line-height: 1.45;
		box-sizing: border-box;
	}
	.ai-input:focus { outline: none; box-shadow: none; }
	.ai-input:disabled { opacity: 0.6; cursor: not-allowed; }

	.ai-send {
		background: #1a1a1a;
		color: #fff;
		border: none;
		border-radius: 6px;
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1.1rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.15s;
	}
	.ai-send:hover:not(:disabled) { background: var(--brand); }
	.ai-send:disabled { opacity: 0.45; cursor: default; }

	.ai-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255,255,255,0.35);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		display: block;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	@media (max-width: 640px) {
		.ai-fab {
			bottom: 1rem;
			left: 1rem;
			padding: 0.5rem 0.95rem 0.5rem 0.75rem;
			font-size: 0.85rem;
		}
		.ai-panel {
			left: 0.5rem;
			right: 0.5rem;
			bottom: 4.25rem;
			width: auto;
			max-width: none;
			max-height: calc(100vh - 5.5rem);
		}
		.ai-panel.maximized {
			left: 0.5rem;
			right: 0.5rem;
			width: auto;
			max-width: none;
		}
		.ai-maximize { display: none; }
		.ai-close { font-size: 1rem; padding: 0.3rem 0.5rem; }
		.ai-clear { font-size: 1.1rem; padding: 0.3rem 0.5rem; }
		.ai-send { width: 2.4rem; height: 2.4rem; }
		.ai-input { font-size: 0.9rem; }
	}
</style>
