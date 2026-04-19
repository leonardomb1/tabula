<script lang="ts">
	import { marked } from 'marked';
	import { onMount } from 'svelte';
	import { aiDock, closeAi, toggleAi } from './aiDock.svelte';

	// Context — the current doc slug if any. Threaded through so the server
	// can bias answers toward the page the user is reading.
	let { currentSlug = null }: { currentSlug?: string | null } = $props();

	const open = $derived(aiDock.open);

	let lastQ = $state('');
	let question = $state('');
	let streaming = $state(false);
	let errMsg = $state('');
	let bodyEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLTextAreaElement | null>(null);

	type Ref = { slug: string; quote: string };
	type Message = { role: 'user' | 'assistant'; content: string; refs?: Ref[] };
	let messages = $state<Message[]>([]);
	let streamingContent = $state('');

	const MAX_HISTORY = 10;

	function parseRefs(text: string): { body: string; refs: Ref[] } {
		const allRefs: Ref[] = [];
		const seen = new Set<string>();
		const body = text
			.replace(/REFS:\[[^\]]*\]/g, (match) => {
				try {
					const refs: Ref[] = JSON.parse(match.slice('REFS:'.length));
					for (const r of refs) {
						const key = `${r.slug}::${r.quote}`;
						if (!seen.has(key)) { seen.add(key); allRefs.push(r); }
					}
				} catch { /* malformed REFS */ }
				return '';
			})
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		return { body, refs: allRefs };
	}

	function citationHref(slug: string, quote: string) {
		return `/${slug}?highlight=${encodeURIComponent(quote)}`;
	}

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

	function clearChat() {
		messages = [];
		streamingContent = '';
		errMsg = '';
	}

	function useTip(prompt: string) {
		question = prompt;
		ask();
	}

	function renderMd(text: string): string {
		return marked.parse(text) as string;
	}

	// ⌘J / Ctrl+J — global toggle. Registered once on mount.
	function onGlobalKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
			e.preventDefault();
			toggleAi();
		}
	}

	// Body-level class drives the page's right-side padding so content can
	// shrink instead of being overlapped by the dock. Kept in sync with the
	// shared state here so every route inherits the behavior automatically.
	$effect(() => {
		if (typeof document === 'undefined') return;
		document.body.classList.toggle('ai-open', aiDock.open);
	});

	$effect(() => {
		if (aiDock.open) {
			setTimeout(() => inputEl?.focus(), 180);
		}
	});

	onMount(() => {
		window.addEventListener('keydown', onGlobalKey);
		return () => window.removeEventListener('keydown', onGlobalKey);
	});
</script>

<aside id="ai-dock" class:is-open={open} aria-label="Assistente IA" aria-hidden={!open}>
	<header class="ai-head">
		<svg class="ai-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8.5L5.5 13v-1.5H3A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z" stroke="var(--accent)" stroke-width="1.3" stroke-linejoin="round"/>
			<path d="M5.2 7.2h.01M8 7.2h.01M10.8 7.2h.01" stroke="var(--accent)" stroke-width="1.6" stroke-linecap="round"/>
		</svg>
		<span class="ai-title">Assistente</span>
		{#if currentSlug}
			<span class="ai-ctx" title="Contexto ativo">doc: {currentSlug}</span>
		{/if}
		<span class="spacer"></span>
		{#if messages.length > 0}
			<button class="ai-clear-btn" onclick={clearChat} title="Limpar conversa">Limpar</button>
		{/if}
		<button class="ai-close-btn" onclick={closeAi} title="Fechar (⌘J)">×</button>
	</header>

	<div class="ai-body" bind:this={bodyEl}>
		{#if messages.length === 0 && !streaming && !streamingContent}
			<div class="ai-empty">
				Peça ao assistente para encontrar, resumir ou comparar documentos.
				<div class="tip-row">
					<button class="tip" onclick={() => useTip('Me dê um panorama dos documentos em 5 linhas.')}>
						<span class="tip-k">Panorama</span>
						Resumir os documentos
					</button>
					<button class="tip" onclick={() => useTip('Encontre documentos que falam sobre infraestrutura.')}>
						<span class="tip-k">Encontrar</span>
						Documentos sobre um tema
					</button>
					<button class="tip" onclick={() => useTip('Proponha uma estrutura de tags mais consistente para os documentos.')}>
						<span class="tip-k">Organizar</span>
						Sugerir taxonomia de tags
					</button>
				</div>
			</div>
		{:else}
			{#each messages as msg}
				<div class="msg {msg.role}">
					<span class="meta">{msg.role === 'user' ? 'Você' : 'Assistente'}</span>
					{#if msg.role === 'user'}
						<div class="bubble">{msg.content}</div>
					{:else}
						<div class="bubble">
							<div class="answer-md">{@html renderMd(msg.content)}</div>
							{#if msg.refs && msg.refs.length > 0}
								<div class="refs">
									{#each msg.refs as ref}
										<a href={citationHref(ref.slug, ref.quote)} class="ref-chip" target="_blank" rel="noopener" title={ref.quote}>
											/{ref.slug}
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
			{#if streamingContent}
				<div class="msg assistant">
					<span class="meta">Assistente</span>
					<div class="bubble">
						<div class="answer-md">{@html renderMd(streamingContent)}<span class="cursor">▋</span></div>
					</div>
				</div>
			{:else if streaming}
				<div class="msg assistant">
					<span class="meta">Assistente</span>
					<div class="bubble">
						<div class="typing"><span></span><span></span><span></span></div>
					</div>
				</div>
			{/if}
		{/if}

		{#if errMsg}
			<div class="err-row">
				<span class="err">{errMsg}</span>
				{#if lastQ}
					<button class="retry" onclick={retry} disabled={streaming}>Tentar novamente</button>
				{/if}
			</div>
		{/if}
	</div>

	<footer class="ai-foot">
		<div class="ai-input-wrap">
			<textarea
				class="ai-input"
				bind:this={inputEl}
				bind:value={question}
				onkeydown={handleKeydown}
				placeholder="Pergunte sobre os documentos…"
				rows="1"
				disabled={streaming}
				spellcheck="false"
				autocomplete="off"
			></textarea>
			<button class="ai-send" onclick={ask} disabled={streaming || !question.trim()} title="Enviar">
				<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		</div>
		<div class="ai-hint">
			<kbd>⏎</kbd> enviar · <kbd>⇧⏎</kbd> nova linha · <kbd>⌘J</kbd> fechar
		</div>
	</footer>
</aside>

<style>
	#ai-dock {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		background: var(--bg);
		border-left: 1px solid var(--rule);
		display: flex;
		flex-direction: column;
		transform: translateX(100%);
		transition: transform 0.28s cubic-bezier(0.2, 0.7, 0.2, 1);
		z-index: 85;
		box-shadow: -20px 0 40px -24px rgba(0, 0, 0, 0.25);
		font-family: var(--font-sans);
	}

	#ai-dock.is-open { transform: translateX(0); }

	.ai-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px;
		height: 48px;
		border-bottom: 1px solid var(--rule);
		background: var(--bg-deep);
		flex-shrink: 0;
	}

	.ai-icon { flex-shrink: 0; }

	.ai-title {
		font-family: var(--font-serif-display);
		font-size: 15px;
		font-weight: 500;
		color: var(--ink);
	}

	.ai-ctx {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--ink-muted);
		background: var(--surface);
		border: 1px solid var(--rule);
		padding: 2px 6px;
		border-radius: 3px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 160px;
	}

	.spacer { flex: 1; }

	.ai-clear-btn,
	.ai-close-btn {
		height: 26px;
		padding: 0 8px;
		border: 0;
		background: transparent;
		color: var(--ink-muted);
		border-radius: 4px;
		font-size: 12px;
		font-family: var(--font-sans);
		cursor: pointer;
	}

	.ai-clear-btn:hover,
	.ai-close-btn:hover { background: var(--surface); color: var(--ink); }

	.ai-close-btn { font-size: 18px; width: 26px; padding: 0; line-height: 1; }

	.ai-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 18px 16px 8px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.ai-empty {
		margin: 14px 0 8px;
		color: var(--ink-muted);
		font-size: 13px;
		line-height: 1.55;
	}

	.tip-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 14px;
	}

	.tip {
		text-align: left;
		padding: 9px 12px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--surface);
		color: var(--ink);
		font-size: 12.5px;
		cursor: pointer;
		font-family: inherit;
	}

	.tip:hover { border-color: var(--accent); color: var(--accent-ink); }

	.tip-k {
		display: block;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--ink-muted);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: 2px;
	}

	.msg {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 92%;
	}

	.msg.user { align-self: flex-end; }

	.meta {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-muted);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.msg.user .meta { text-align: right; }

	.bubble {
		padding: 9px 12px;
		border-radius: 10px;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--ink);
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.msg.user .bubble {
		background: var(--accent-soft);
		color: var(--accent-ink);
		border-bottom-right-radius: 3px;
	}

	.msg.assistant .bubble {
		background: var(--surface);
		border: 1px solid var(--rule);
		border-bottom-left-radius: 3px;
		font-family: var(--font-serif-body);
		font-size: 14.5px;
		white-space: normal;
	}

	.answer-md :global(p) { margin: 0 0 0.5em; }
	.answer-md :global(p:last-child) { margin-bottom: 0; }
	.answer-md :global(ul), .answer-md :global(ol) { margin: 0 0 0.5em; padding-left: 1.3em; }
	.answer-md :global(li) { margin-bottom: 0.15em; }
	.answer-md :global(code) {
		font-family: var(--font-mono);
		font-size: 12px;
		padding: 1px 4px;
		background: var(--bg-deep);
		border: 1px solid var(--rule-soft);
		border-radius: 3px;
	}
	.answer-md :global(pre) {
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 8px 10px;
		overflow-x: auto;
		margin: 0 0 0.5em;
	}
	.answer-md :global(pre code) { background: none; border: 0; padding: 0; font-size: 12px; }
	.answer-md :global(a) { color: var(--accent-ink); border-bottom: 1px solid var(--accent-soft); }

	.cursor {
		display: inline-block;
		animation: blink 0.8s steps(1) infinite;
		color: var(--ink-muted);
		margin-left: 1px;
	}

	@keyframes blink { 50% { opacity: 0; } }

	.refs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--rule-soft);
	}

	.ref-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 2px 8px;
		background: var(--bg);
		border: 1px solid var(--rule);
		border-radius: 4px;
		font-size: 11px;
		font-family: var(--font-mono);
		color: var(--ink-soft);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ref-chip:hover {
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.typing {
		display: inline-flex;
		gap: 4px;
		padding: 4px 2px;
	}

	.typing span {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--ink-muted);
		animation: aiDot 1.1s infinite ease-in-out;
	}

	.typing span:nth-child(2) { animation-delay: 0.15s; }
	.typing span:nth-child(3) { animation-delay: 0.3s; }

	@keyframes aiDot {
		0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
		40% { opacity: 1; transform: translateY(-2px); }
	}

	.err-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.err {
		color: oklch(0.55 0.18 25);
		font-size: 12.5px;
	}

	:global([data-theme='dark']) .err { color: oklch(0.78 0.16 25); }

	.retry {
		background: transparent;
		border: 1px solid var(--accent);
		color: var(--accent);
		border-radius: 4px;
		padding: 2px 9px;
		font-size: 11.5px;
		cursor: pointer;
		font-family: var(--font-sans);
	}

	.retry:hover:not(:disabled) { background: var(--accent); color: #fff; }
	.retry:disabled { opacity: 0.5; cursor: default; }

	.ai-foot {
		padding: 10px 12px 14px;
		border-top: 1px solid var(--rule);
		background: var(--bg-deep);
		flex-shrink: 0;
	}

	.ai-input-wrap {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 8px;
		padding: 8px 10px;
	}

	.ai-input-wrap:focus-within { border-color: var(--accent); }

	textarea.ai-input {
		flex: 1;
		min-height: 20px;
		max-height: 160px;
		border: 0;
		outline: 0;
		resize: none;
		background: transparent;
		color: var(--ink);
		font-family: var(--font-sans);
		font-size: 13.5px;
		line-height: 1.45;
	}

	.ai-input:disabled { opacity: 0.6; }

	.ai-send {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 6px;
		background: var(--accent);
		color: #fff;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		cursor: pointer;
	}

	.ai-send:disabled { opacity: 0.4; cursor: not-allowed; }

	.ai-hint {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--ink-muted);
	}

	.ai-hint kbd {
		background: var(--surface);
		border: 1px solid var(--rule);
		padding: 1px 4px;
		border-radius: 3px;
	}

	/* Body-level shift so page content can shrink instead of being
	   overlapped. Driven by the .ai-open class toggled on <body> from the
	   $effect above. Skipped on small viewports where we overlay instead. */
	:global(body) {
		transition: padding-right 0.28s cubic-bezier(0.2, 0.7, 0.2, 1);
	}

	:global(body.ai-open) { padding-right: 380px; }

	@media (max-width: 860px) {
		#ai-dock { width: 100vw; }
		:global(body.ai-open) { padding-right: 0; }
	}
</style>
