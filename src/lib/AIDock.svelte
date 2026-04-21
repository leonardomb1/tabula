<script lang="ts">
	import { marked } from 'marked';
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { aiDock, closeAi, toggleAi } from './aiDock.svelte';
	import { editorBridge } from './aiEditorBridge.svelte';
	import { collapseToHunks, diffStats, lineDiff, type Hunk } from './diff';

	// Context — the current doc slug if any. Threaded through so the server
	// can bias answers toward the page the user is reading.
	let {
		currentSlug = null,
		currentWs = null
	}: { currentSlug?: string | null; currentWs?: string | null } = $props();

	const open = $derived(aiDock.open);
	const agentMode = $derived(aiDock.agentMode);

	let lastQ = $state('');
	let question = $state('');
	let streaming = $state(false);
	let errMsg = $state('');
	let bodyEl = $state<HTMLDivElement | null>(null);
	let inputEl = $state<HTMLTextAreaElement | null>(null);

	type Ref = { wsId: string; slug: string; quote: string };
	// Agent-mode structures: one "agent" message collects interleaved text,
	// tool calls, and pending approval cards for a whole turn. Chat mode
	// stays on the simpler `content + refs` shape.
	type ActionState = 'pending' | 'saving' | 'accepted' | 'dismissed' | 'error';
	type DraftAction =
		| {
				kind: 'propose_new_document';
				wsId: string;
				title: string;
				content: string;
				rationale?: string;
				state: ActionState;
				createdSlug?: string;
				error?: string;
		  }
		| {
				kind: 'propose_edit_document';
				wsId: string;
				slug: string;
				title: string;
				oldContent: string;
				newContent: string;
				rationale?: string;
				state: ActionState;
				error?: string;
		  };
	type AgentStep =
		| { kind: 'text'; text: string }
		| {
				kind: 'tool';
				id: string;
				name: string;
				input: unknown;
				state: 'running' | 'ok' | 'error';
				output?: unknown;
				error?: string;
				action?: DraftAction;
		  };
	type Message =
		| { role: 'user'; content: string }
		| { role: 'assistant'; content: string; refs?: Ref[] }
		| { role: 'agent'; steps: AgentStep[] };
	let messages = $state<Message[]>([]);
	let streamingContent = $state('');

	// Chat history persists across navigations + reloads via localStorage.
	// Loaded once on mount (below), written after every turn finishes
	// (see the $effect near the bottom of the script). Capped at 50
	// messages to stay well under the 5 MB per-origin storage limit even
	// with agent turns that embed document previews.
	const STORAGE_KEY = 'tabula-ai-history';
	const MAX_STORED_MESSAGES = 50;
	// Abort handle for the current agent turn. Stop button calls .abort()
	// which tears down the fetch, which triggers the server to detect
	// `request.signal.aborted` and break out of the Anthropic tool loop.
	// $state so the footer can swap Send → Stop reactively while streaming.
	let agentAbort = $state<AbortController | null>(null);

	const MAX_HISTORY = 10;

	function parseRefs(text: string): { body: string; refs: Ref[] } {
		const allRefs: Ref[] = [];
		const seen = new Set<string>();
		const body = text
			.replace(/REFS:\[[^\]]*\]/g, (match) => {
				try {
					const refs: Ref[] = JSON.parse(match.slice('REFS:'.length));
					for (const r of refs) {
						if (!r?.wsId || !r?.slug || !r?.quote) continue;
						const key = `${r.wsId}::${r.slug}::${r.quote}`;
						if (!seen.has(key)) { seen.add(key); allRefs.push(r); }
					}
				} catch { /* malformed REFS */ }
				return '';
			})
			.replace(/\n{3,}/g, '\n\n')
			.trim();
		return { body, refs: allRefs };
	}

	function citationHref(wsId: string, slug: string, quote: string) {
		return `/w/${wsId}/${slug}?highlight=${encodeURIComponent(quote)}`;
	}

	async function fetchAI(q: string) {
		streaming = true;
		errMsg = '';
		streamingContent = '';
		lastQ = q;

		// Flatten agent turns into plain assistant messages — Anthropic's
		// API only accepts "user" / "assistant", and the chat endpoint
		// forwards this history verbatim. Without this, any agent-mode
		// turn persisted from an earlier session gets rejected with
		// "Unexpected role 'agent'".
		type ChatHistoryMsg = { role: 'user' | 'assistant'; content: string };
		const historyToSend: ChatHistoryMsg[] = messages
			.slice(-MAX_HISTORY - 1, -1)
			.flatMap<ChatHistoryMsg>((m) => {
				if (m.role === 'user') return [{ role: 'user', content: m.content }];
				if (m.role === 'assistant')
					return [{ role: 'assistant', content: m.content }];
				const text = m.steps
					.filter((s): s is Extract<AgentStep, { kind: 'text' }> => s.kind === 'text')
					.map((s) => s.text)
					.join('\n');
				return text ? [{ role: 'assistant', content: text }] : [];
			});

		try {
			const res = await fetch('/api/ai', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question: q, currentSlug, currentWs, history: historyToSend })
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

	async function fetchAgent(q: string) {
		streaming = true;
		errMsg = '';
		lastQ = q;

		// Flatten prior history to plain text turns — the agent endpoint
		// doesn't replay tool calls, just conversational context.
		type HistoryMsg = { role: 'user' | 'assistant'; content: string };
		const historyToSend: HistoryMsg[] = messages
			.slice(-MAX_HISTORY - 1, -1)
			.flatMap<HistoryMsg>((m) => {
				if (m.role === 'user') return [{ role: 'user', content: m.content }];
				if (m.role === 'assistant')
					return [{ role: 'assistant', content: m.content }];
				// agent message → collapse its text steps into one assistant turn
				const text = m.steps
					.filter((s): s is Extract<AgentStep, { kind: 'text' }> => s.kind === 'text')
					.map((s) => s.text)
					.join('\n');
				return text ? [{ role: 'assistant', content: text }] : [];
			});

		const agentMsg: Message = { role: 'agent', steps: [] };
		messages = [...messages, agentMsg];
		// `stepsRef` is a live reference into messages — Svelte tracks the
		// array change when we swap it in. We mutate it and reassign to
		// trigger reactivity; writing `msg.steps = [...]` directly also
		// works but reassigning the whole array keeps intent obvious.
		const updateSteps = (mutate: (steps: AgentStep[]) => AgentStep[]) => {
			const last = messages[messages.length - 1];
			if (last?.role !== 'agent') return;
			messages = [
				...messages.slice(0, -1),
				{ role: 'agent', steps: mutate(last.steps) }
			];
			setTimeout(() => bodyEl?.scrollTo({ top: bodyEl.scrollHeight }), 0);
		};

		agentAbort = new AbortController();
		try {
			const res = await fetch('/api/ai/agent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: agentAbort.signal,
				body: JSON.stringify({
					message: q,
					currentSlug,
					currentWs,
					history: historyToSend,
					// When the editor is mounted and carrying an unsaved
					// buffer, ship its current contents so tools like
					// `read_document` / `propose_edit_document` can prefer
					// the live draft over the stale file on disk.
					currentEditor: editorBridge.applyEdit
						? {
								slug: editorBridge.slug,
								wsId: editorBridge.wsId,
								content: editorBridge.content
						  }
						: null
				})
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				errMsg = data.message ?? `Erro ${res.status}`;
				return;
			}

			const reader = res.body!.getReader();
			const dec = new TextDecoder();
			let buf = '';
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += dec.decode(value, { stream: true });
				const lines = buf.split('\n');
				buf = lines.pop() ?? '';
				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					const payload = line.slice(6);
					if (payload === '[DONE]') continue;
					let ev: {
						type: string;
						delta?: string;
						id?: string;
						name?: string;
						input?: unknown;
						output?: unknown;
						error?: string;
						message?: string;
						action?: {
							kind: string;
							path?: string;
							wsId?: string;
							title?: string;
							content?: string;
							rationale?: string;
						};
					};
					try {
						ev = JSON.parse(payload);
					} catch {
						continue;
					}
					switch (ev.type) {
						case 'text': {
							// Coalesce consecutive text deltas into the
							// current text step. Each delta is a partial
							// token stream — feeding them to `marked.parse`
							// individually mangles markdown that spans
							// chunks (`**bold**` split mid-word, single
							// paragraphs fragmented into many `<p>`). A
							// tool step in between breaks the run so pre-
							// and post-tool commentary render as separate
							// blocks.
							const delta = ev.delta ?? '';
							if (!delta) break;
							updateSteps((steps) => {
								const last = steps[steps.length - 1];
								if (last?.kind === 'text') {
									return [
										...steps.slice(0, -1),
										{ kind: 'text', text: last.text + delta }
									];
								}
								return [...steps, { kind: 'text', text: delta }];
							});
							break;
						}
						case 'tool_use':
							updateSteps((steps) => [
								...steps,
								{
									kind: 'tool',
									id: ev.id!,
									name: ev.name!,
									input: ev.input,
									state: 'running'
								}
							]);
							break;
						case 'tool_result':
							updateSteps((steps) =>
								steps.map((s) =>
									s.kind === 'tool' && s.id === ev.id
										? { ...s, state: 'ok', output: ev.output }
										: s
								)
							);
							break;
						case 'tool_error':
							updateSteps((steps) =>
								steps.map((s) =>
									s.kind === 'tool' && s.id === ev.id
										? { ...s, state: 'error', error: ev.error }
										: s
								)
							);
							break;
						case 'action':
							handleAction(ev.id!, ev.action!, updateSteps);
							break;
						case 'error':
							errMsg = ev.message ?? 'Erro do agente';
							break;
						case 'done':
							break;
					}
				}
			}
		} catch (e) {
			if (agentAbort?.signal.aborted || (e instanceof Error && e.name === 'AbortError')) {
				// User cancelled — swallow silently and annotate the transcript
				// so they know the partial turn is the final state.
				const last = messages[messages.length - 1];
				if (last?.role === 'agent') {
					messages = [
						...messages.slice(0, -1),
						{
							role: 'agent',
							steps: [...last.steps, { kind: 'text', text: '\n_(interrompido pelo usuário)_' }]
						}
					];
				}
			} else {
				errMsg = e instanceof Error ? e.message : 'Falha na conexão';
			}
		} finally {
			agentAbort = null;
			streaming = false;
			// If the agent message came back empty (no text + no tools), drop
			// it so the transcript doesn't show a ghost row.
			const last = messages[messages.length - 1];
			if (last?.role === 'agent' && last.steps.length === 0) {
				messages = messages.slice(0, -1);
			}
			// Tool cards stuck in 'running' after a cancel — mark them as
			// cancelled so the UI isn't spinning forever.
			const tail = messages[messages.length - 1];
			if (tail?.role === 'agent') {
				const patched = tail.steps.map((s) =>
					s.kind === 'tool' && s.state === 'running'
						? { ...s, state: 'error' as const, error: 'Cancelado' }
						: s
				);
				messages = [...messages.slice(0, -1), { role: 'agent', steps: patched }];
			}
		}
	}

	function stopAgent() {
		agentAbort?.abort();
	}

	type StreamedAction = {
		kind: string;
		path?: string;
		wsId?: string;
		wsName?: string;
		slug?: string;
		title?: string;
		content?: string;
		oldContent?: string;
		newContent?: string;
		rationale?: string;
	};

	function handleAction(
		toolId: string,
		action: StreamedAction,
		updateSteps: (m: (s: AgentStep[]) => AgentStep[]) => void
	) {
		if (action.kind === 'navigate' && action.path) {
			// Navigate immediately — reversible, read-only, no approval needed
			// per product decision.
			goto(action.path);
			return;
		}
		if (action.kind === 'switch_workspace' && action.wsId) {
			// Mirror WorkspaceModal.pick(): set the cookie + localStorage so
			// SSR and other tabs stay aligned, then navigate to `/` with
			// `invalidateAll` so the layout reloads against the new active
			// workspace.
			if (typeof localStorage !== 'undefined') localStorage.setItem('docs_ws', action.wsId);
			document.cookie = `docs_ws=${encodeURIComponent(action.wsId)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
			goto('/', { invalidateAll: true });
			return;
		}
		if (action.kind === 'propose_new_document') {
			updateSteps((steps) =>
				steps.map((s) =>
					s.kind === 'tool' && s.id === toolId
						? {
								...s,
								action: {
									kind: 'propose_new_document',
									wsId: action.wsId!,
									title: action.title!,
									content: action.content!,
									rationale: action.rationale,
									state: 'pending'
								}
						  }
						: s
				)
			);
			return;
		}
		if (action.kind === 'propose_edit_document') {
			updateSteps((steps) =>
				steps.map((s) =>
					s.kind === 'tool' && s.id === toolId
						? {
								...s,
								action: {
									kind: 'propose_edit_document',
									wsId: action.wsId!,
									slug: action.slug!,
									title: action.title!,
									oldContent: action.oldContent ?? '',
									newContent: action.newContent ?? '',
									rationale: action.rationale,
									state: 'pending'
								}
						  }
						: s
				)
			);
			return;
		}
	}

	async function acceptDraft(msgIdx: number, stepId: string) {
		const msg = messages[msgIdx];
		if (msg?.role !== 'agent') return;
		const step = msg.steps.find(
			(s): s is Extract<AgentStep, { kind: 'tool' }> =>
				s.kind === 'tool' && s.id === stepId && !!s.action
		);
		if (!step?.action) return;
		const draft = step.action;
		draft.state = 'saving';
		messages = [...messages];

		// Editor-bridge shortcut: when the user is in /new editing the
		// same doc the AI is proposing an edit for, route the approved
		// content through the editor. Preferred path is the inline
		// unified-merge review (startDiffReview) so the user can accept
		// or reject each hunk individually; applyEdit is the whole-
		// buffer fallback for older editor builds.
		if (
			draft.kind === 'propose_edit_document' &&
			editorBridge.slug === draft.slug &&
			editorBridge.wsId === draft.wsId &&
			(editorBridge.startDiffReview || editorBridge.applyEdit)
		) {
			try {
				if (editorBridge.startDiffReview) {
					// Resolves when the user clicks "Concluir revisão" in
					// the editor. While it's open, the accept card shows
					// "Revisando…" so it's clear where the interaction has
					// moved.
					draft.state = 'saving';
					messages = [...messages];
					await editorBridge.startDiffReview(draft.newContent);
				} else if (editorBridge.applyEdit) {
					await editorBridge.applyEdit(draft.newContent);
				}
				draft.state = 'accepted';
			} catch (e) {
				draft.state = 'error';
				draft.error = e instanceof Error ? e.message : 'Falha ao aplicar no editor';
			} finally {
				messages = [...messages];
			}
			return;
		}

		// Shared save path — /api/save handles both create (no slug) and
		// overwrite (slug present); the canWrite gate runs on the server.
		const body =
			draft.kind === 'propose_new_document'
				? { content: draft.content }
				: { slug: draft.slug, content: draft.newContent };
		try {
			const res = await fetch(`/api/save?ws=${encodeURIComponent(draft.wsId)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				draft.state = 'error';
				draft.error = data.message ?? `Erro ${res.status}`;
			} else {
				const data = await res.json();
				draft.state = 'accepted';
				if (draft.kind === 'propose_new_document') draft.createdSlug = data.slug;
				// An accepted edit on the saved file changes whatever page
				// the user is currently viewing. Re-run load functions so
				// the reader, home page, etc. reflect the new state
				// without a manual refresh.
				if (draft.kind === 'propose_edit_document') {
					await invalidateAll();
				}
			}
		} catch (e) {
			draft.state = 'error';
			draft.error = e instanceof Error ? e.message : 'Falha na conexão';
		} finally {
			messages = [...messages];
		}
	}

	function dismissDraft(msgIdx: number, stepId: string) {
		const msg = messages[msgIdx];
		if (msg?.role !== 'agent') return;
		const step = msg.steps.find(
			(s): s is Extract<AgentStep, { kind: 'tool' }> =>
				s.kind === 'tool' && s.id === stepId && !!s.action
		);
		if (step?.action) {
			step.action.state = 'dismissed';
			messages = [...messages];
		}
	}

	async function retry() {
		if (!lastQ || streaming) return;
		messages = messages.slice(0, -1);
		errMsg = '';
		messages = [...messages, { role: 'user', content: lastQ }];
		if (agentMode) await fetchAgent(lastQ);
		else await fetchAI(lastQ);
	}

	async function ask() {
		if (!question.trim() || streaming) return;
		const q = question.trim();
		question = '';
		messages = [...messages, { role: 'user', content: q }];
		if (agentMode) await fetchAgent(q);
		else await fetchAI(q);
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

	function prettyToolName(name: string): string {
		switch (name) {
			case 'get_context': return 'Contexto atual';
			case 'search_workspace': return 'Buscar';
			case 'list_documents': return 'Listar documentos';
			case 'read_document': return 'Ler documento';
			case 'fetch_url': return 'Buscar URL';
			case 'search_academic': return 'Pesquisa acadêmica';
			case 'search_stackoverflow': return 'Stack Overflow';
			case 'search_web': return 'Busca web';
			case 'propose_new_document': return 'Rascunhar novo documento';
			case 'propose_edit_document': return 'Propor edição';
			case 'switch_workspace': return 'Trocar workspace';
			case 'navigate_to': return 'Navegar';
			default: return name;
		}
	}

	function toolSummary(name: string, input: unknown): string {
		if (!input || typeof input !== 'object') return '';
		const i = input as Record<string, unknown>;
		if (name === 'search_workspace' && typeof i.query === 'string') return `"${i.query}"`;
		if (name === 'read_document' && typeof i.slug === 'string') return i.slug;
		if (name === 'list_documents' && typeof i.wsId === 'string') return i.wsId;
		if (name === 'fetch_url' && typeof i.url === 'string') {
			try { return new URL(i.url).hostname; } catch { return i.url.slice(0, 40); }
		}
		if (
			(name === 'search_academic' ||
				name === 'search_stackoverflow' ||
				name === 'search_web') &&
			typeof i.query === 'string'
		) {
			return `"${i.query}"`;
		}
		if (name === 'propose_new_document' && typeof i.title === 'string') return i.title;
		if (name === 'propose_edit_document' && typeof i.slug === 'string') return i.slug;
		if (name === 'switch_workspace' && typeof i.wsId === 'string') return i.wsId;
		if (name === 'navigate_to' && typeof i.path === 'string') return i.path;
		return '';
	}

	// Diff output is reused across renders; computing it every render for
	// a long doc gets expensive. Memo keyed on the (old, new) string pair.
	const diffCache = new Map<string, { hunks: Hunk[]; stats: { added: number; removed: number } }>();
	function getDiff(oldText: string, newText: string) {
		const key = oldText.length + '|' + newText.length + '|' + oldText.slice(0, 40);
		const hit = diffCache.get(key);
		if (hit) return hit;
		const lines = lineDiff(oldText, newText);
		const result = { hunks: collapseToHunks(lines, 3), stats: diffStats(lines) };
		diffCache.set(key, result);
		return result;
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

	// Auto-resize the textarea to match its content. Reset to `auto` first
	// so shrinking works (scrollHeight only grows if we don't clear it),
	// then set to scrollHeight. CSS `max-height: 160px` still caps the
	// element — past that the textarea scrolls internally.
	$effect(() => {
		// Reference `question` so the effect re-runs on every edit.
		question;
		if (!inputEl) return;
		inputEl.style.height = 'auto';
		inputEl.style.height = inputEl.scrollHeight + 'px';
	});

	// Handoff from the search palette: consume the pending query, drop it
	// into the input, and move the caret to the end so the user can tweak
	// or press Enter. Reset pendingQuery after reading to make it one-shot.
	$effect(() => {
		const q = aiDock.pendingQuery;
		if (!q) return;
		question = q;
		aiDock.pendingQuery = null;
		setTimeout(() => {
			inputEl?.focus();
			const len = inputEl?.value.length ?? 0;
			inputEl?.setSelectionRange(len, len);
		}, 200);
	});

	onMount(() => {
		window.addEventListener('keydown', onGlobalKey);
		// Rehydrate prior conversation once the component mounts. A stored
		// history that fails to parse (schema drift, corrupted entry) is
		// dropped silently — the dock starts empty instead of crashing.
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					messages = parsed.slice(-MAX_STORED_MESSAGES);
				}
			}
		} catch {
			/* storage disabled or corrupted — start fresh */
		}
		return () => window.removeEventListener('keydown', onGlobalKey);
	});

	// Persist after every settled turn (not during streaming — we'd
	// re-save on every delta and the partial-content writes would
	// dominate). An accepted/dismissed draft action also re-triggers
	// this via its mutation on `messages`.
	$effect(() => {
		if (streaming) return;
		if (typeof localStorage === 'undefined') return;
		try {
			const slice = messages.slice(-MAX_STORED_MESSAGES);
			localStorage.setItem(STORAGE_KEY, JSON.stringify(slice));
		} catch {
			/* quota exceeded or disabled — ignore */
		}
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
		<button
			type="button"
			class="head-btn agent-btn"
			class:is-active={aiDock.agentMode}
			onclick={() => (aiDock.agentMode = !aiDock.agentMode)}
			aria-pressed={aiDock.agentMode}
			title={aiDock.agentMode
				? 'Modo agente ativo — clique para desativar'
				: 'Ativar modo agente (navegação + rascunho + edição com aprovação)'}
			aria-label="Alternar modo agente"
		>
			<!-- Robot-style glyph: a rounded head with antenna, eyes, and a
			     mouth slit. Reads as "agent" without a label and matches the
			     other header icons' 13px footprint. -->
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path d="M8 2v1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
				<circle cx="8" cy="2" r="0.8" fill="currentColor"/>
				<rect x="3" y="4" width="10" height="9" rx="2" stroke="currentColor" stroke-width="1.3"/>
				<circle cx="6" cy="8" r="0.9" fill="currentColor"/>
				<circle cx="10" cy="8" r="0.9" fill="currentColor"/>
				<path d="M6 11h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
			</svg>
		</button>
		{#if messages.length > 0}
			<button
				type="button"
				class="head-btn"
				onclick={clearChat}
				title="Limpar conversa"
				aria-label="Limpar conversa"
			>
				<!-- Counter-clockwise arrow — standard reset/reload glyph. -->
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
					<path d="M3 8a5 5 0 1 0 1.5-3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
					<path d="M2 2v3.5H5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		{/if}
		<button class="ai-close-btn" onclick={closeAi} title="Fechar (⌘J)" aria-label="Fechar">×</button>
	</header>

	<div class="ai-body" bind:this={bodyEl}>
		{#if messages.length === 0 && !streaming && !streamingContent}
			<div class="ai-empty">
				{#if agentMode}
					Modo agente: peça para encontrar, rascunhar novos documentos, ou navegar. Edições em documentos existentes precisam da sua aprovação e nada é excluído.
					<div class="tip-row">
						<button class="tip" onclick={() => useTip('Rascunhe um novo documento sobre o processo de onboarding da equipe.')}>
							<span class="tip-k">Rascunhar</span>
							Novo documento
						</button>
						<button class="tip" onclick={() => useTip('Encontre documentos sobre infraestrutura e me leve ao mais relevante.')}>
							<span class="tip-k">Navegar</span>
							Abrir o mais relevante
						</button>
						<button class="tip" onclick={() => useTip('Liste os documentos que temos e sugira uma taxonomia de tags mais consistente.')}>
							<span class="tip-k">Analisar</span>
							Sugerir taxonomia
						</button>
					</div>
				{:else}
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
				{/if}
			</div>
		{:else}
			{#each messages as msg, msgIdx}
				<div class="msg {msg.role}">
					<span class="meta">
						{#if msg.role === 'user'}
							Você
						{:else if msg.role === 'agent'}
							Agente
						{:else}
							Assistente
						{/if}
					</span>
					{#if msg.role === 'user'}
						<div class="bubble">{msg.content}</div>
					{:else if msg.role === 'assistant'}
						<div class="bubble">
							<div class="answer-md">{@html renderMd(msg.content)}</div>
							{#if msg.refs && msg.refs.length > 0}
								<div class="refs">
									{#each msg.refs as ref}
										<a href={citationHref(ref.wsId, ref.slug, ref.quote)} class="ref-chip" target="_blank" rel="noopener" title={ref.quote}>
											/{ref.slug}
										</a>
									{/each}
								</div>
							{/if}
						</div>
					{:else}
						<div class="bubble agent-bubble">
							{#each msg.steps as step (step.kind === 'text' ? msgIdx + '-t-' + msg.steps.indexOf(step) : step.id)}
								{#if step.kind === 'text'}
									<div class="answer-md">{@html renderMd(step.text)}</div>
								{:else}
									<div class="tool-card tool-{step.state}">
										<div class="tool-head">
											<span class="tool-ico" aria-hidden="true">
												{#if step.state === 'running'}
													<span class="tool-spin"></span>
												{:else if step.state === 'error'}
													✕
												{:else}
													✓
												{/if}
											</span>
											<span class="tool-name">{prettyToolName(step.name)}</span>
											<span class="tool-meta">{toolSummary(step.name, step.input)}</span>
										</div>
										{#if step.state === 'error' && step.error}
											<div class="tool-err">{step.error}</div>
										{/if}
										{#if step.action}
											<div class="draft-card draft-{step.action.state}">
												<div class="draft-head">
													<span class="draft-kind">
														{step.action.kind === 'propose_new_document' ? 'Novo documento' : 'Edição proposta'}
													</span>
													<span class="draft-title">{step.action.title}</span>
													{#if step.action.kind === 'propose_edit_document'}
														{@const stats = getDiff(step.action.oldContent, step.action.newContent).stats}
														<span class="draft-stats">
															<span class="draft-stats__add">+{stats.added}</span>
															<span class="draft-stats__del">−{stats.removed}</span>
														</span>
													{/if}
												</div>
												{#if step.action.rationale}
													<div class="draft-rationale">{step.action.rationale}</div>
												{/if}
												{#if step.action.kind === 'propose_new_document'}
													<div class="draft-preview">
														{step.action.content.slice(0, 320)}{step.action.content.length > 320 ? '…' : ''}
													</div>
												{:else}
													<div class="draft-diff">
														{#each getDiff(step.action.oldContent, step.action.newContent).hunks as hunk}
															{#if hunk.kind === 'gap'}
																<div class="diff-gap">… {hunk.count} {hunk.count === 1 ? 'linha inalterada' : 'linhas inalteradas'} …</div>
															{:else}
																{#each hunk.lines as line}
																	<div class="diff-line diff-{line.kind}">
																		<span class="diff-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}</span>
																		<span class="diff-text">{line.text}</span>
																	</div>
																{/each}
															{/if}
														{/each}
													</div>
												{/if}
												{#if step.action.state === 'pending'}
													<div class="draft-actions">
														<button
															class="draft-btn primary"
															onclick={() => acceptDraft(msgIdx, step.id)}
														>
															{step.action.kind === 'propose_new_document' ? 'Criar documento' : 'Aplicar edição'}
														</button>
														<button
															class="draft-btn"
															onclick={() => dismissDraft(msgIdx, step.id)}
														>Descartar</button>
													</div>
												{:else if step.action.state === 'saving'}
													<div class="draft-status">Salvando…</div>
												{:else if step.action.state === 'accepted'}
													<div class="draft-status draft-ok">
														{step.action.kind === 'propose_new_document' ? 'Documento criado.' : 'Edição aplicada.'}
														{#if step.action.kind === 'propose_new_document' && step.action.createdSlug}
															<a
																href={`/w/${step.action.wsId}/${step.action.createdSlug}`}
																onclick={() => closeAi()}
															>Abrir</a>
														{:else if step.action.kind === 'propose_edit_document'}
															<a
																href={`/w/${step.action.wsId}/${step.action.slug}`}
																onclick={() => closeAi()}
															>Abrir</a>
														{/if}
													</div>
												{:else if step.action.state === 'dismissed'}
													<div class="draft-status draft-dismissed">Descartado.</div>
												{:else if step.action.state === 'error'}
													<div class="draft-status draft-err">Falha: {step.action.error}</div>
												{/if}
											</div>
										{/if}
									</div>
								{/if}
							{/each}
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
			{:else if streaming && !agentMode}
				<!-- Chat-mode only: agent mode has its own in-progress bubble
				     (the agent message grows with steps as they arrive), so
				     a second "Assistente" typing placeholder duplicates it. -->
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
				placeholder={agentMode ? 'Peça ao agente uma tarefa…' : 'Pergunte sobre os documentos…'}
				rows="1"
				disabled={streaming}
				spellcheck="false"
				autocomplete="off"
			></textarea>
			{#if streaming && agentAbort}
				<button class="ai-send ai-stop" onclick={stopAgent} title="Parar o agente">
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
						<rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/>
					</svg>
				</button>
			{:else}
				<button class="ai-send" onclick={ask} disabled={streaming || !question.trim()} title="Enviar">
					<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
						<path d="M2 8h11M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			{/if}
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

	/* Shared header-button metrics: square, transparent, subtle hover.
	   Covers the agent toggle and the reset/clear button. Close keeps
	   its own tweak below for the outsized "×" glyph. */
	.head-btn,
	.ai-close-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink-muted);
		border-radius: 4px;
		font-family: var(--font-sans);
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.12s, color 0.12s;
	}
	.head-btn:hover,
	.ai-close-btn:hover { background: var(--surface); color: var(--ink); }
	.head-btn:active { transform: scale(0.94); }

	/* Agent toggle — accent pill when active so the "agent is on" signal
	   is unmistakable at a glance. */
	.agent-btn.is-active {
		background: var(--accent-soft);
		color: var(--accent-ink);
	}
	.agent-btn.is-active:hover {
		background: color-mix(in oklab, var(--accent-soft) 70%, var(--accent) 30%);
	}

	.ai-close-btn { font-size: 18px; line-height: 1; }

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

	.msg.assistant .bubble,
	.msg.agent .bubble {
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
		background: var(--code-surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
		padding: 8px 10px;
		overflow-x: auto;
		margin: 0 0 0.5em;
	}

	/* The markdown pipeline wraps every code block in .code-block with a
	   header (language + copy). In the chat bubbles we tighten the default
	   margins so the header doesn't balloon compact answers. */
	.answer-md :global(.code-block) { margin: 6px 0 8px; }
	.answer-md :global(.code-head) {
		padding: 2px 8px;
		min-height: 20px;
		font-size: 9.5px;
		border-radius: 5px 5px 0 0;
	}
	.answer-md :global(.code-block > pre) { padding: 6px 10px; }
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
		overflow-y: auto;
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

	/* Overlay mode below ~1404px — mobile breakpoint (1024) plus the
	   dock's own 380px. In this band the push-behavior would shrink the
	   top bar's effective width into mobile territory, squashing the
	   brand/search/actions row. Switching to overlay keeps content
	   full-width; the dock floats on top of the right side of the page
	   and users close it to see what's underneath (same pattern the
	   1024px block already uses for phones). */
	@media (max-width: 1404px) {
		:global(body.ai-open) { padding-right: 0; }
	}

	@media (max-width: 1024px) {
		#ai-dock { width: 100vw; }
	}

	/* ══════════════════════════════════════
	   Agent mode
	═══════════════════════════════════════ */

	.agent-bubble {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Tool call card — compact row with state glyph, tool name, and a
	   subtle context hint (query, slug, URL host). Sits between the
	   agent's text blocks in the turn so the reader can follow which
	   action produced which paragraph. */
	.tool-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 10px;
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		border-left: 3px solid var(--ink-muted);
		border-radius: 6px;
		font-family: var(--font-sans);
		font-size: 11.5px;
		color: var(--ink-soft);
	}
	.tool-card.tool-running { border-left-color: var(--accent); }
	.tool-card.tool-ok { border-left-color: oklch(0.65 0.14 150); }
	.tool-card.tool-error { border-left-color: oklch(0.62 0.18 25); }

	.tool-head {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.tool-ico {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
	.tool-spin {
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--rule);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}
	.tool-name { color: var(--ink); font-weight: 500; flex-shrink: 0; }
	.tool-meta {
		color: var(--ink-muted);
		font-family: var(--font-mono);
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.tool-err {
		color: oklch(0.55 0.18 25);
		font-size: 11.5px;
	}

	/* Draft approval card — the high-consequence UI. Bigger surface,
	   clear action buttons, preview of the first ~300 chars so the user
	   can judge without opening anything else. */
	.draft-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--rule);
		border-radius: 6px;
	}
	.draft-title {
		font-family: var(--font-serif-display);
		font-size: 15px;
		font-weight: 500;
		color: var(--ink);
		line-height: 1.25;
	}
	.draft-rationale {
		font-size: 11.5px;
		color: var(--ink-muted);
		font-style: italic;
	}
	.draft-preview {
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.45;
		color: var(--ink-soft);
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 8px 10px;
		max-height: 120px;
		overflow: hidden;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.draft-actions {
		display: flex;
		gap: 6px;
		margin-top: 2px;
	}
	.draft-btn {
		display: inline-flex;
		align-items: center;
		height: 26px;
		padding: 0 10px;
		border: 1px solid var(--rule);
		background: var(--bg);
		color: var(--ink-soft);
		border-radius: 4px;
		font-family: var(--font-sans);
		font-size: 12px;
		cursor: pointer;
	}
	.draft-btn:hover { background: var(--surface); color: var(--ink); }
	.draft-btn.primary {
		background: var(--ink);
		color: var(--bg);
		border-color: var(--ink);
	}
	.draft-btn.primary:hover {
		background: oklch(0.3 0.015 80);
	}
	.draft-status {
		font-size: 11.5px;
		color: var(--ink-muted);
	}
	.draft-status.draft-ok { color: oklch(0.55 0.14 150); }
	.draft-status.draft-ok a { color: var(--accent); text-decoration: underline; margin-left: 6px; }
	.draft-status.draft-err { color: oklch(0.55 0.18 25); }

	/* Draft card head row — kind chip + title + add/remove counts. */
	.draft-head {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.draft-kind {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
		padding: 2px 6px;
		border: 1px solid var(--rule);
		border-radius: 3px;
	}
	.draft-stats {
		display: inline-flex;
		gap: 6px;
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.draft-stats__add { color: oklch(0.55 0.14 150); }
	.draft-stats__del { color: oklch(0.55 0.18 25); }

	/* Diff card — GitHub-style unified view. Scrollable so large edits
	   don't explode the dock; collapse markers keep the whole thing
	   skimmable. */
	.draft-diff {
		font-family: var(--font-mono);
		font-size: 11px;
		line-height: 1.5;
		background: var(--bg-deep);
		border: 1px solid var(--rule);
		border-radius: 4px;
		max-height: 280px;
		overflow: auto;
	}
	.diff-line {
		display: flex;
		padding: 0 8px;
		white-space: pre;
	}
	.diff-line .diff-sign {
		display: inline-block;
		width: 12px;
		flex-shrink: 0;
		text-align: center;
		color: var(--ink-muted);
	}
	.diff-line .diff-text {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
	}
	.diff-line.diff-add {
		background: color-mix(in oklab, oklch(0.7 0.14 150) 15%, transparent);
		color: var(--ink);
	}
	.diff-line.diff-add .diff-sign { color: oklch(0.5 0.14 150); }
	.diff-line.diff-del {
		background: color-mix(in oklab, oklch(0.65 0.18 25) 15%, transparent);
		color: var(--ink);
	}
	.diff-line.diff-del .diff-sign { color: oklch(0.5 0.18 25); }
	.diff-line.diff-same { color: var(--ink-soft); }
	.diff-gap {
		padding: 4px 10px;
		text-align: center;
		color: var(--ink-muted);
		font-size: 10.5px;
		background: var(--surface);
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
	}

	/* Stop button — same footprint as Send, red-tinted so it reads as
	   "abort" rather than "submit". Square glyph echoes standard media
	   stop semantics. */
	.ai-stop {
		background: oklch(0.55 0.18 25) !important;
		color: var(--bg) !important;
	}
	.ai-stop:hover { background: oklch(0.48 0.18 25) !important; }
</style>
