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
		const doc = await getDoc(wsId, slug);
		if (!doc) return { ok: false, error: 'Documento não encontrado' };
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
		const doc = await getDoc(wsId, slug);
		if (!doc) return { ok: false, error: 'Documento não encontrado' };
		// No write happens here — the user reviews the diff on the client
		// and, if they accept, the client POSTs to /api/save with the new
		// content. That endpoint has its own canWrite gate.
		return {
			ok: true,
			data: {
				proposed: true,
				wsId,
				slug,
				title: doc.title,
				note: 'Diff exibido ao usuário para aprovação. Nenhuma alteração foi salva.'
			},
			action: {
				kind: 'propose_edit_document',
				wsId,
				slug,
				title: doc.title,
				oldContent: doc.source,
				newContent,
				rationale
			}
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

export const TOOLS: ToolDef[] = [
	getContext,
	searchWorkspace,
	listDocuments,
	readDocument,
	fetchUrl,
	proposeNewDocument,
	proposeEditDocument,
	navigateTo
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
