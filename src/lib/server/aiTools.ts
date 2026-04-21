/**
 * AI agent tools — schemas + server-side executors. Each tool either reads
 * state (bounded by the invoking user's access) or *proposes* a client-side
 * action that requires user approval before it takes effect. No tool in this
 * module can delete, overwrite, or silently write documents — those paths
 * were excluded by product decision.
 *
 * Tools come in two shapes:
 *  - Plain tools (search/read/list/context/fetch_url) — the executor runs
 *    server-side, returns data, and the agent loop feeds the result back
 *    into the model.
 *  - Client-action proposals (propose_new_document, navigate_to) — the
 *    executor returns a stub success result so the agent can continue
 *    reasoning, and the SSE stream emits a separate `action` event the
 *    client handles (renders an approval card, performs navigation, etc).
 *    The actual side effect happens only when the client acts on the
 *    approval — never from the agent loop itself.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { SessionInfo } from './auth';
import { canAccess, getForUser, listForUser, PERSONAL_PREFIX } from './workspaces';
import { getAllDocs, getDoc } from './docsIndex';

/**
 * Runtime context handed to every tool executor. `currentWs` / `currentSlug`
 * come from wherever the dock was opened so the AI can orient itself without
 * the user having to repeat that context.
 */
export interface ToolContext {
	user: SessionInfo;
	currentWs: string | null;
	currentSlug: string | null;
	/** Live editor buffer when the user is on /new. `slug` is null for a
	 *  fresh draft. Tools that target this doc should prefer this over
	 *  the saved file on disk, which may be stale relative to what the
	 *  user is actually looking at. */
	currentEditor: { slug: string | null; wsId: string | null; content: string } | null;
}

/**
 * Shape every executor returns. Successful results are serialized as JSON
 * and fed back to the model; errors are fed back with `is_error: true` so
 * the model can recover / report instead of crashing the loop.
 */
export type ToolOutcome =
	| { ok: true; data: unknown; action?: ClientAction }
	| { ok: false; error: string };

/**
 * Client-side effects the server wants the browser to perform. Streamed as
 * their own SSE event (type: 'action') alongside the regular tool_result.
 */
export type ClientAction =
	| { kind: 'navigate'; path: string }
	| { kind: 'switch_workspace'; wsId: string; wsName: string }
	| {
			kind: 'propose_new_document';
			wsId: string;
			title: string;
			content: string;
			/** Short note the dock surfaces under the preview — "por que esse doc?". */
			rationale?: string;
	  }
	| {
			kind: 'propose_edit_document';
			wsId: string;
			slug: string;
			title: string;
			oldContent: string;
			newContent: string;
			rationale?: string;
	  };

export interface ToolDef {
	name: string;
	description: string;
	input_schema: Anthropic.Tool.InputSchema;
	execute: (ctx: ToolContext, input: Record<string, unknown>) => Promise<ToolOutcome>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const MAX_FETCH_BYTES = 80_000;
const FETCH_TIMEOUT_MS = 10_000;
const SEARCH_TIMEOUT_MS = 12_000;

/**
 * Small wrapper around `fetch` that adds an abort timeout and JSON parse.
 * Keeps the search-tool executors free of boilerplate.
 */
async function fetchJson<T>(
	url: string,
	opts: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? SEARCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
			signal: ac.signal
		});
		if (!res.ok) {
			return { ok: false, error: `resposta ${res.status}`, status: res.status };
		}
		// `Response.json()` is typed `Promise<any>`, so this flows into T
		// without an explicit cast — no `as T` / unknown gymnastics.
		const data: T = await res.json();
		return { ok: true, data };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : 'falha na consulta' };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * OpenAlex stores abstracts as `{word: [positions...]}` — an inverted
 * index saved that way to avoid copyright concerns on the raw text.
 * Reconstruct the linear sentence so the model can actually read it.
 */
function reconstructAbstract(inv: Record<string, number[]> | null | undefined): string | null {
	if (!inv || typeof inv !== 'object') return null;
	const pairs: Array<[number, string]> = [];
	for (const [word, positions] of Object.entries(inv)) {
		if (!Array.isArray(positions)) continue;
		for (const p of positions) pairs.push([p, word]);
	}
	if (pairs.length === 0) return null;
	pairs.sort((a, b) => a[0] - b[0]);
	return pairs.map(([, w]) => w).join(' ');
}

/**
 * Stack Exchange response bodies are HTML. The model doesn't need markup,
 * just the prose — strip tags and entities to a flat string.
 */
function stripHtml(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

function asString(v: unknown): string | null {
	return typeof v === 'string' && v.trim() ? v : null;
}

/**
 * Collect every workspace id the current user can read docs from (personal
 * + team). Used by `search` and `list_documents` when the caller doesn't
 * pin a workspace explicitly.
 */
async function accessibleWorkspaceIds(user: SessionInfo): Promise<string[]> {
	const teams = await listForUser(user);
	return [...new Set([`${PERSONAL_PREFIX}${user.username}`, ...teams.map((w) => w.id)])];
}

// ─── Tool implementations ─────────────────────────────────────────────────

const searchWorkspace: ToolDef = {
	name: 'search_workspace',
	description:
		'Search the user\'s accessible documents by keyword. Returns up to 10 matches with title, workspace, slug, and a snippet. Use this first to find relevant documents; follow up with `read_document` to get full contents.',
	input_schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Free-text search query. Short phrases work best (2–5 words).'
			},
			wsId: {
				type: 'string',
				description:
					'Optional workspace id to scope the search. Omit to search across every workspace the user can access.'
			}
		},
		required: ['query']
	},
	async execute(ctx, input) {
		const query = asString(input.query);
		if (!query) return { ok: false, error: 'query é obrigatório' };
		const wsScope = asString(input.wsId);
		const wsIds = wsScope ? [wsScope] : await accessibleWorkspaceIds(ctx.user);

		// Naive scoring — same approach used in the chat-answer endpoint.
		// Good enough for retrieval at 10s-of-docs scale; revisit when we
		// have embeddings in place.
		const terms = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
		const hits: Array<{ wsId: string; slug: string; title: string; snippet: string; score: number }> = [];
		for (const wsId of wsIds) {
			if (!(await canAccess(ctx.user, wsId))) continue;
			const docs = await getAllDocs(wsId);
			for (const d of docs) {
				const hay = `${d.title} ${d.body}`.toLowerCase();
				const score = terms.reduce((s, t) => s + (hay.split(t).length - 1), 0);
				if (score > 0) {
					const snippet = d.body.slice(0, 200).replace(/\s+/g, ' ').trim();
					hits.push({ wsId, slug: d.slug, title: d.title, snippet, score });
				}
			}
		}
		hits.sort((a, b) => b.score - a.score);
		return { ok: true, data: hits.slice(0, 10).map(({ score: _s, ...rest }) => rest) };
	}
};

const readDocument: ToolDef = {
	name: 'read_document',
	description:
		'Return the full markdown source of a document (including frontmatter) the user has access to. Use this to pull context before answering questions or drafting content that builds on existing docs.',
	input_schema: {
		type: 'object',
		properties: {
			wsId: { type: 'string', description: 'Workspace id the document lives in.' },
			slug: { type: 'string', description: 'Document slug, e.g. "K0ZaByyoz3".' }
		},
		required: ['wsId', 'slug']
	},
	async execute(ctx, input) {
		const wsId = asString(input.wsId);
		const slug = asString(input.slug);
		if (!wsId || !slug) return { ok: false, error: 'wsId e slug são obrigatórios' };
		if (!(await canAccess(ctx.user, wsId))) {
			return { ok: false, error: 'Sem acesso a esse workspace' };
		}
		// Prefer the live editor buffer when the user is currently editing
		// this exact doc — they may have unsaved changes that the disk
		// file doesn't reflect. Fall through to the saved file otherwise.
		if (
			ctx.currentEditor &&
			ctx.currentEditor.slug === slug &&
			ctx.currentEditor.wsId === wsId
		) {
			return {
				ok: true,
				data: {
					wsId,
					slug,
					source: ctx.currentEditor.content,
					fromLiveBuffer: true,
					note: 'Conteúdo vem do buffer do editor (pode ter alterações não salvas).'
				}
			};
		}
		const doc = await getDoc(wsId, slug);
		if (!doc) {
			const hint =
				ctx.currentSlug && ctx.currentWs === wsId
					? ` O usuário está atualmente visualizando "${ctx.currentSlug}" neste mesmo workspace — use esse slug se o pedido era sobre "este documento".`
					: '';
			return {
				ok: false,
				error: `Documento "${slug}" não encontrado no workspace "${wsId}".${hint}`
			};
		}
		return {
			ok: true,
			data: { wsId, slug, title: doc.title, source: doc.source, mtime: doc.mtime }
		};
	}
};

const listDocuments: ToolDef = {
	name: 'list_documents',
	description:
		'List titles and slugs of every document the user can see. Useful as a starting map when the AI has no specific query yet.',
	input_schema: {
		type: 'object',
		properties: {
			wsId: {
				type: 'string',
				description: 'Optional workspace id. Omit to list across every accessible workspace.'
			}
		}
	},
	async execute(ctx, input) {
		const wsScope = asString(input.wsId);
		const wsIds = wsScope ? [wsScope] : await accessibleWorkspaceIds(ctx.user);
		const out: Array<{ wsId: string; slug: string; title: string }> = [];
		for (const wsId of wsIds) {
			if (!(await canAccess(ctx.user, wsId))) continue;
			const docs = await getAllDocs(wsId);
			for (const d of docs) out.push({ wsId, slug: d.slug, title: d.title });
			if (out.length > 200) break; // hard cap — prevents model blow-up on huge workspaces
		}
		return { ok: true, data: out.slice(0, 200) };
	}
};

const getContext: ToolDef = {
	name: 'get_context',
	description:
		'Report what the user is currently looking at — active workspace, open document (if any), and the list of workspaces they can access with their role in each. Call this once at the start to orient the conversation.',
	input_schema: { type: 'object', properties: {} },
	async execute(ctx) {
		const teams = await listForUser(ctx.user);
		return {
			ok: true,
			data: {
				currentWs: ctx.currentWs,
				currentSlug: ctx.currentSlug,
				user: {
					username: ctx.user.username,
					displayName: ctx.user.displayName,
					isPlatformAdmin: ctx.user.isPlatformAdmin === true
				},
				workspaces: teams.map((w) => ({ id: w.id, name: w.name, kind: w.kind }))
			}
		};
	}
};

const fetchUrl: ToolDef = {
	name: 'fetch_url',
	description:
		'Fetch the contents of a public URL (HTTP GET only). Use for citations, summarizing external pages, or pulling reference material the user explicitly linked. Output is truncated to ~80 KB.',
	input_schema: {
		type: 'object',
		properties: {
			url: {
				type: 'string',
				description: 'Absolute http(s) URL. Redirects are followed; only GET is supported.'
			}
		},
		required: ['url']
	},
	async execute(_ctx, input) {
		const url = asString(input.url);
		if (!url) return { ok: false, error: 'url é obrigatório' };
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return { ok: false, error: 'URL inválida' };
		}
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return { ok: false, error: 'Apenas http(s) é suportado' };
		}
		// Block requests that look like they're hitting the local network.
		// Stops the agent from pivoting to internal services via a crafted URL.
		const host = parsed.hostname.toLowerCase();
		if (
			host === 'localhost' ||
			host === '127.0.0.1' ||
			host === '::1' ||
			host.endsWith('.internal') ||
			host.endsWith('.local') ||
			/^10\./.test(host) ||
			/^192\.168\./.test(host) ||
			/^172\.(1[6-9]|2\d|3[01])\./.test(host)
		) {
			return { ok: false, error: 'Host local/privado não permitido' };
		}

		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
		try {
			const res = await fetch(parsed.toString(), {
				method: 'GET',
				signal: ac.signal,
				redirect: 'follow',
				headers: { 'User-Agent': 'tabula-ai-agent/1.0' }
			});
			const raw = await res.text();
			const truncated = raw.length > MAX_FETCH_BYTES;
			return {
				ok: true,
				data: {
					url: parsed.toString(),
					status: res.status,
					contentType: res.headers.get('content-type'),
					truncated,
					content: truncated ? raw.slice(0, MAX_FETCH_BYTES) : raw
				}
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'fetch falhou';
			return { ok: false, error: msg };
		} finally {
			clearTimeout(timer);
		}
	}
};

// ─── Research tools (gated behind AI_WEB_RESEARCH env) ───────────────────
//
// Three targeted search APIs: OpenAlex for academic literature,
// Stack Exchange for practical engineering Q&A, Brave for general web.
// Each executor bounds the result count and trims long fields so the
// model's context budget stays tight. All three respect a global
// `AI_WEB_RESEARCH` env flag; Brave additionally requires a key.

interface OpenAlexWork {
	title?: string | null;
	publication_year?: number | null;
	cited_by_count?: number;
	doi?: string | null;
	id?: string;
	abstract_inverted_index?: Record<string, number[]> | null;
	authorships?: Array<{ author?: { display_name?: string } }>;
	best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null } | null;
}

const searchAcademic: ToolDef = {
	name: 'search_academic',
	description:
		'Search peer-reviewed / academic literature via OpenAlex (250M+ works — the open successor to Microsoft Academic). Returns up to 8 papers with title, authors, year, abstract excerpt, citation count, and DOI. Best for research questions, bibliography building, and claim verification against published work.',
	input_schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Free-text search — title keywords, topic phrase, or author name.'
			}
		},
		required: ['query']
	},
	async execute(_ctx, input) {
		const query = asString(input.query);
		if (!query) return { ok: false, error: 'query é obrigatório' };
		// OpenAlex asks API users to identify themselves in the User-Agent
		// ("polite pool") for better rate-limit treatment.
		const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8`;
		const res = await fetchJson<{ results?: OpenAlexWork[] }>(url, {
			headers: { 'User-Agent': 'tabula-ai-agent (mailto:admin@tabula.local)' }
		});
		if (!res.ok) return { ok: false, error: `OpenAlex: ${res.error}` };
		const results = res.data.results ?? [];
		const hits = results.map((w) => {
			const abstract = reconstructAbstract(w.abstract_inverted_index);
			return {
				title: w.title,
				authors: (w.authorships ?? [])
					.slice(0, 5)
					.map((a) => a.author?.display_name)
					.filter((n): n is string => !!n),
				year: w.publication_year,
				citationCount: w.cited_by_count ?? 0,
				doi: w.doi,
				openAccessUrl: w.best_oa_location?.pdf_url ?? w.best_oa_location?.landing_page_url ?? null,
				abstract: abstract ? abstract.slice(0, 500) : null,
				openAlexId: w.id
			};
		});
		return { ok: true, data: hits };
	}
};

interface StackExchangeItem {
	title?: string;
	link?: string;
	score?: number;
	answer_count?: number;
	is_answered?: boolean;
	creation_date?: number;
	tags?: string[];
	body?: string;
}

const searchStackoverflow: ToolDef = {
	name: 'search_stackoverflow',
	description:
		'Search Stack Overflow for technical Q&A. Returns up to 8 relevant questions with title, score, answer count, tags, excerpt, and URL. Best for "how do I…", debugging, and concrete implementation questions.',
	input_schema: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'Free-text search — error message, concept, or phrasing users would type.'
			}
		},
		required: ['query']
	},
	async execute(_ctx, input) {
		const query = asString(input.query);
		if (!query) return { ok: false, error: 'query é obrigatório' };
		const params = new URLSearchParams({
			order: 'desc',
			sort: 'relevance',
			q: query,
			site: 'stackoverflow',
			pagesize: '8',
			filter: 'withbody'
		});
		// STACK_EXCHANGE_KEY is optional — without it we get 300/day per IP;
		// with it the quota rises to 10K/day.
		if (process.env.STACK_EXCHANGE_KEY) params.set('key', process.env.STACK_EXCHANGE_KEY);
		const url = `https://api.stackexchange.com/2.3/search/advanced?${params}`;
		const res = await fetchJson<{ items?: StackExchangeItem[] }>(url);
		if (!res.ok) return { ok: false, error: `Stack Exchange: ${res.error}` };
		const items = res.data.items ?? [];
		const hits = items.map((q) => ({
			title: q.title,
			url: q.link,
			score: q.score,
			answers: q.answer_count,
			hasAcceptedAnswer: q.is_answered === true,
			tags: q.tags ?? [],
			excerpt: q.body ? stripHtml(q.body).slice(0, 400) : null
		}));
		return { ok: true, data: hits };
	}
};

interface BraveResult {
	title?: string;
	url?: string;
	description?: string;
	page_age?: string;
}
interface BraveResponse {
	web?: { results?: BraveResult[] };
}

const searchWeb: ToolDef = {
	name: 'search_web',
	description:
		'General web search via Brave. Returns up to 8 results with title, URL, description, and page age. Use only when `search_academic` or `search_stackoverflow` don\'t fit — e.g., news, product pages, vendor docs, recent events.',
	input_schema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'Free-text search query.' }
		},
		required: ['query']
	},
	async execute(_ctx, input) {
		const query = asString(input.query);
		if (!query) return { ok: false, error: 'query é obrigatório' };
		const key = process.env.BRAVE_API_KEY;
		if (!key) {
			return { ok: false, error: 'Busca web não configurada no servidor (BRAVE_API_KEY ausente)' };
		}
		const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
		const res = await fetchJson<BraveResponse>(url, {
			headers: { 'X-Subscription-Token': key }
		});
		if (!res.ok) return { ok: false, error: `Brave: ${res.error}` };
		const results = res.data.web?.results ?? [];
		const hits = results.map((r) => ({
			title: r.title,
			url: r.url,
			description: r.description ? stripHtml(r.description).slice(0, 300) : null,
			pageAge: r.page_age ?? null
		}));
		return { ok: true, data: hits };
	}
};

const proposeNewDocument: ToolDef = {
	name: 'propose_new_document',
	description:
		'Draft a new document for the user to review. The AI never saves the document directly — the user sees an approval card with the full content and can click to create it or dismiss it. Always explain the rationale so the user knows why this draft was prepared.',
	input_schema: {
		type: 'object',
		properties: {
			wsId: {
				type: 'string',
				description:
					'Workspace id to save the document to. Must be one the user can write to. If unsure, prefer the current workspace from `get_context`.'
			},
			title: {
				type: 'string',
				description:
					'Document title. Should also appear as an H1 at the top of the content.'
			},
			content: {
				type: 'string',
				description:
					'Full markdown source. Include an opening frontmatter block (--- ... ---) with at least `author` and `date`; follow with the H1 and body. No code-fence wrapper.'
			},
			rationale: {
				type: 'string',
				description:
					'One-sentence explanation of why this draft exists. Shown under the approval card.'
			}
		},
		required: ['wsId', 'title', 'content']
	},
	async execute(ctx, input) {
		const wsId = asString(input.wsId);
		const title = asString(input.title);
		const content = asString(input.content);
		const rationale = asString(input.rationale) ?? undefined;
		if (!wsId || !title || !content) {
			return { ok: false, error: 'wsId, title e content são obrigatórios' };
		}
		const ws = await getForUser(ctx.user, wsId);
		if (!ws) return { ok: false, error: 'Workspace não acessível' };
		// We do *not* write here. The client renders an approval card; if the
		// user accepts, the client POSTs to /api/save (which has its own
		// canWrite gate). Return a stub success so the agent can continue
		// and tell the user what to look for.
		return {
			ok: true,
			data: {
				proposed: true,
				wsId,
				title,
				note: 'Draft exibido ao usuário para aprovação. Nenhum documento foi salvo.'
			},
			action: { kind: 'propose_new_document', wsId, title, content, rationale }
		};
	}
};

const proposeEditDocument: ToolDef = {
	name: 'propose_edit_document',
	description:
		'Propose a full-document rewrite of an existing document for the user to review as a diff. The AI never applies the edit directly — the user sees a red/green diff card and accepts or discards it. Always fetch the current source with `read_document` first so the rewrite is deliberate, and explain the rationale.',
	input_schema: {
		type: 'object',
		properties: {
			wsId: { type: 'string', description: 'Workspace id the document lives in.' },
			slug: { type: 'string', description: 'Document slug to edit.' },
			newContent: {
				type: 'string',
				description:
					'The complete new markdown source (frontmatter + body). This replaces the entire document if the user accepts — return the full doc, not a patch.'
			},
			rationale: {
				type: 'string',
				description: 'One-sentence explanation of the change. Shown under the diff card.'
			}
		},
		required: ['wsId', 'slug', 'newContent']
	},
	async execute(ctx, input) {
		const wsId = asString(input.wsId);
		const slug = asString(input.slug);
		const newContent = asString(input.newContent);
		const rationale = asString(input.rationale) ?? undefined;
		if (!wsId || !slug || !newContent) {
			return { ok: false, error: 'wsId, slug e newContent são obrigatórios' };
		}
		if (!(await canAccess(ctx.user, wsId))) {
			return { ok: false, error: 'Sem acesso a esse workspace' };
		}
		// Pick the basis for the diff. If the user is in the editor with
		// this same doc open, the live buffer is the authoritative "before"
		// state — diffing against the saved file would show stale changes
		// as if they were part of the AI's proposal.
		const useLiveBuffer =
			!!ctx.currentEditor &&
			ctx.currentEditor.slug === slug &&
			ctx.currentEditor.wsId === wsId;

		let title: string;
		let oldContent: string;
		if (useLiveBuffer && ctx.currentEditor) {
			oldContent = ctx.currentEditor.content;
			// Title isn't in the buffer directly; fall back to disk's title,
			// or use the slug as a last resort. Cheap call — getDoc is cached.
			const doc = await getDoc(wsId, slug);
			title = doc?.title ?? slug;
		} else {
			const doc = await getDoc(wsId, slug);
			if (!doc) {
				const hint =
					ctx.currentSlug && ctx.currentWs === wsId
						? ` O usuário está atualmente visualizando o documento com slug "${ctx.currentSlug}" neste mesmo workspace — se o pedido era para editar "este documento", use esse slug.`
						: '';
				return {
					ok: false,
					error: `Documento "${slug}" não encontrado no workspace "${wsId}".${hint}`
				};
			}
			title = doc.title;
			oldContent = doc.source;
		}

		// No write happens here — the user reviews the diff on the client
		// and, if they accept, the client either calls the editor bridge
		// (when in /new) or POSTs to /api/save. Both paths have their own
		// gates.
		return {
			ok: true,
			data: {
				proposed: true,
				wsId,
				slug,
				title,
				targetedLiveBuffer: useLiveBuffer,
				note: useLiveBuffer
					? 'Diff proposto contra o buffer do editor. Se aceito, o buffer é atualizado e o usuário ainda precisa salvar.'
					: 'Diff exibido ao usuário para aprovação. Nenhuma alteração foi salva.'
			},
			action: {
				kind: 'propose_edit_document',
				wsId,
				slug,
				title,
				oldContent,
				newContent,
				rationale
			}
		};
	}
};

const switchWorkspace: ToolDef = {
	name: 'switch_workspace',
	description:
		'Switch the user\'s active workspace. Necessary when the user wants to "go to" a different workspace or see its document list — the home page reads the active workspace from a cookie, not from the URL. After switching, the browser lands on `/` scoped to the new workspace. Use this before `list_documents` / `search_workspace` if the user is exploring a workspace they\'re not currently in. The special value `"personal"` resolves to the caller\'s own personal workspace (you don\'t need to know their username). On invalid input, the error message lists every workspace the user can access — use that list to retry.',
	input_schema: {
		type: 'object',
		properties: {
			wsId: {
				type: 'string',
				description:
					'The workspace id to activate, or the literal string "personal" to switch to the caller\'s personal workspace. Must be one the user can access (see `get_context`).'
			}
		},
		required: ['wsId']
	},
	async execute(ctx, input) {
		const raw = asString(input.wsId);
		if (!raw) return { ok: false, error: 'wsId é obrigatório' };
		// Shorthand — "personal" resolves to the caller's own personal
		// workspace so the model doesn't have to know the username.
		const wsId = raw === 'personal' ? `${PERSONAL_PREFIX}${ctx.user.username}` : raw;
		const ws = await getForUser(ctx.user, wsId);
		if (!ws) {
			// List accessible workspaces in the error so the model can
			// self-correct on the next turn instead of guessing another id.
			const accessible = await listForUser(ctx.user);
			const options = accessible
				.map((w) => `${w.id} (${w.name}, ${w.kind})`)
				.join('; ');
			return {
				ok: false,
				error: `Workspace "${raw}" não existe ou o usuário não tem acesso. Opções disponíveis: ${options}`
			};
		}
		return {
			ok: true,
			data: { switched: true, wsId: ws.id, wsName: ws.name },
			action: { kind: 'switch_workspace', wsId: ws.id, wsName: ws.name }
		};
	}
};

const navigateTo: ToolDef = {
	name: 'navigate_to',
	description:
		'Move the user to a page inside the app. Only supports in-app paths (starts with "/"). Navigation is applied immediately without approval — safe because it\'s reversible and read-only.',
	input_schema: {
		type: 'object',
		properties: {
			path: {
				type: 'string',
				description:
					'Absolute in-app path, e.g. "/w/personal-alice/abc123" or "/settings/workspaces/xyz". Must start with "/".'
			}
		},
		required: ['path']
	},
	async execute(_ctx, input) {
		const path = asString(input.path);
		if (!path) return { ok: false, error: 'path é obrigatório' };
		if (!path.startsWith('/') || path.startsWith('//')) {
			return { ok: false, error: 'path deve ser relativo ao app e começar com /' };
		}
		return {
			ok: true,
			data: { navigated: true, path },
			action: { kind: 'navigate', path }
		};
	}
};

/**
 * Web-research tool set — OpenAlex, Stack Exchange, Brave. Gated by env so
 * workspaces / deployments that don't want the AI reaching outside can
 * leave them off. `AI_WEB_RESEARCH=true` enables the whole feature;
 * Brave additionally requires `BRAVE_API_KEY`. The per-workspace toggle
 * is the planned follow-up — for now this is a platform-level switch.
 */
export const WEB_RESEARCH_ENABLED = process.env.AI_WEB_RESEARCH === 'true';
export const BRAVE_ENABLED = WEB_RESEARCH_ENABLED && !!process.env.BRAVE_API_KEY;

export const TOOLS: ToolDef[] = [
	getContext,
	searchWorkspace,
	listDocuments,
	readDocument,
	fetchUrl,
	proposeNewDocument,
	proposeEditDocument,
	switchWorkspace,
	navigateTo,
	...(WEB_RESEARCH_ENABLED ? [searchAcademic, searchStackoverflow] : []),
	...(BRAVE_ENABLED ? [searchWeb] : [])
];

export const TOOL_MAP: Record<string, ToolDef> = Object.fromEntries(
	TOOLS.map((t) => [t.name, t])
);

/**
 * Anthropic-shaped `tools` array. Exported so the agent endpoint can drop
 * it straight into `messages.create`.
 */
export const ANTHROPIC_TOOLS: Anthropic.Tool[] = TOOLS.map((t) => ({
	name: t.name,
	description: t.description,
	input_schema: t.input_schema
}));
