import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Access } from '../access';
import { searchDocs } from '../search';
import {
	getDoc,
	getDocBySlug,
	listDocs,
	getBacklinks,
	resolveDocRefs,
	createDoc,
	updateDoc,
	promoteDoc,
	revertDraft,
	DocRevisionConflictError,
	DraftUndoUnavailableError
} from '../docs';
import { DRAFT_TTL_DAYS, ensureDraftSweeper, listDrafts } from '../drafts';
import { applyEdits, lineCount, withLineNumbers, type Edit } from '../patch';
import { getPublishedDoc, openPublishRequest, requestPublish, onDocUpdated } from '../publication';
import { ensureWorkspace, listWorkspaces } from '../workspaces';
import { getTemplate, listTemplates, parseTemplateMeta, subjectInputs } from '../templates';
import { renderMarkdown } from '../markdown';
import { renderMarkdownToPdfKeyed } from '../markdown/pdf';
import { compileSvg, explainCompileError, TypstCompileError } from '../typst';
import { signArtifact } from '../artifacts';
import { formalNameFor } from '../userSettings';
import { personalWorkspaceId, slugify } from '../ids';

/**
 * Absolute base for links handed to a caller. ORIGIN is what adapter-node already
 * uses to build absolute URLs, so an artifact link matches the host the service
 * reaches tabula on.
 */
function origin(): string {
	return (process.env.ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
	content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
});
const fail = (message: string): ToolResult => ({
	content: [{ type: 'text', text: message }],
	isError: true
});
/** An error the caller is expected to act on programmatically, not just read. */
const failWith = (data: unknown): ToolResult => ({
	content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
	isError: true
});

export function buildMcpServer(access: Access): McpServer {
	const server = new McpServer(
		{ name: 'tabula', version: '0.1.0' },
		{ capabilities: { tools: {} }, instructions: 'Search, read, and write tabula documentation.' }
	);

	server.registerTool(
		'search_docs',
		{
			title: 'Search documents',
			description:
				'Full-text search across documents the caller can access. Returns ranked hits with highlighted snippets.',
			inputSchema: {
				query: z.string().describe('Search query (supports quoted phrases and -exclusions)'),
				workspaceId: z.string().optional().describe('Restrict to one workspace'),
				limit: z.number().int().min(1).max(50).optional()
			}
		},
		async ({ query, workspaceId, limit }) => {
			const hits = await searchDocs(access, { query, workspaceId, limit });
			return ok(
				hits.map((h) => ({
					id: h.id,
					workspaceId: h.workspaceId,
					slug: h.slug,
					title: h.title,
					snippet: h.snippet
				}))
			);
		}
	);

	server.registerTool(
		'list_workspaces',
		{
			title: 'List workspaces',
			description: 'List the workspaces the caller can access, with their role in each.',
			inputSchema: {}
		},
		async () => {
			const all = await listWorkspaces();
			return ok(
				all
					.filter((w) => access.can(w.id))
					.map((w) => ({ id: w.id, name: w.name, role: access.role(w.id) }))
			);
		}
	);

	server.registerTool(
		'list_docs',
		{
			title: 'List documents',
			description:
				'List documents in a workspace the caller can access. Drafts are excluded unless includeDrafts is set — use list_drafts for those.',
			inputSchema: {
				workspaceId: z.string(),
				includeDrafts: z.boolean().optional().describe('Include unfinished drafts in the listing')
			}
		},
		async ({ workspaceId, includeDrafts }) => {
			if (!access.can(workspaceId)) return fail(`No access to workspace ${workspaceId}`);
			const docs = await listDocs(workspaceId, { includeDrafts });
			return ok(
				docs.map((d) => ({
					id: d.id,
					slug: d.slug,
					title: d.title,
					mode: d.mode,
					isPublic: d.isPublic,
					publicSlug: d.publicSlug,
					...(d.ephemeral ? { ephemeral: true } : {})
				}))
			);
		}
	);

	server.registerTool(
		'get_doc',
		{
			title: 'Get a document',
			description: 'Fetch a document by id, or by workspace + slug. Returns its source and metadata.',
			inputSchema: {
				id: z.string().optional(),
				workspaceId: z.string().optional(),
				slug: z.string().optional()
			}
		},
		async ({ id, workspaceId, slug }) => {
			const doc = id
				? await getDoc(id)
				: workspaceId && slug
					? await getDocBySlug(workspaceId, slug)
					: null;
			if (!doc) return fail('Document not found (provide id, or workspaceId + slug)');
			if (!doc.isPublic && !access.can(doc.workspaceId)) return fail('Access denied');
			const pending = await openPublishRequest(doc.id);
			return ok({
				id: doc.id,
				workspaceId: doc.workspaceId,
				slug: doc.slug,
				title: doc.title,
				mode: doc.mode,
				tags: doc.tags,
				updatedAt: doc.updatedAt,
				isPublic: doc.isPublic,
				publicSlug: doc.publicSlug,
				publishedVersionNo: doc.publishedVersionNo,
				publicationPending: !!pending,
				source: doc.source
			});
		}
	);

	server.registerTool(
		'create_doc',
		{
			title: 'Create a document',
			description:
				'Create a new document in a workspace (requires editor access). New documents are private — use request_publish to publish. Returns the new id and slug.',
			inputSchema: {
				workspaceId: z.string(),
				title: z.string().min(1),
				source: z
					.string()
					.describe('Document body: markdown (```typst blocks allowed) or typst source'),
				mode: z.enum(['markdown', 'typst']).optional().describe("Defaults to 'markdown'"),
				slug: z.string().optional().describe('URL slug; derived from the title when omitted'),
				tags: z.array(z.string()).optional()
			}
		},
		async ({ workspaceId, title, source, mode, slug, tags }) => {
			if (!access.can(workspaceId, 'editor')) return fail(`Requires editor access to ${workspaceId}`);
			const doc = await createDoc({
				workspaceId,
				title,
				mode: mode ?? 'markdown',
				source,
				slug,
				tags,
				actor: access.principal.username
			});
			await onDocUpdated(doc);
			return ok({ id: doc.id, workspaceId: doc.workspaceId, slug: doc.slug, title: doc.title });
		}
	);

	server.registerTool(
		'update_doc',
		{
			title: 'Update a document',
			description:
				"Update an existing document's content or metadata by id (requires editor access). Each save records a new version. Publication state is unchanged — use request_publish to (re)publish.",
			inputSchema: {
				id: z.string(),
				title: z.string().optional(),
				source: z.string().optional(),
				mode: z.enum(['markdown', 'typst']).optional(),
				tags: z.array(z.string()).optional()
			}
		},
		async ({ id, title, source, mode, tags }) => {
			const existing = await getDoc(id);
			if (!existing) return fail('Document not found');
			if (!access.can(existing.workspaceId, 'editor')) return fail('Requires editor access');
			const updated = await updateDoc(id, { title, source, mode, tags }, access.principal.username);
			await onDocUpdated(updated);
			return ok({
				id: updated.id,
				workspaceId: updated.workspaceId,
				slug: updated.slug,
				title: updated.title,
				updatedAt: updated.updatedAt
			});
		}
	);

	/** Resolves the doc a draft tool was pointed at, with the editor check applied. */
	async function editableDoc(id: string) {
		const doc = await getDoc(id);
		if (!doc) return { ok: false as const, result: fail(`Document not found: ${id}`) };
		if (!access.can(doc.workspaceId, 'editor')) {
			return { ok: false as const, result: fail('Requires editor access') };
		}
		return { ok: true as const, doc };
	}

	server.registerTool(
		'create_draft',
		{
			title: 'Create a draft',
			description:
				'Start a document you intend to revise. A draft is a real document you can patch, compile and render, but it stays out of search, listings and backlinks, records no version history, and is deleted automatically after ' +
				`${DRAFT_TTL_DAYS} days unless kept with keep_doc. Defaults to your personal workspace. ` +
				'THIS IS THE WAY TO WRITE ANYTHING LONG: send the full source ONCE here, then use patch_doc for every later change instead of resending the document. Returns the id and rev to patch against.',
			inputSchema: {
				title: z.string().min(1),
				source: z
					.string()
					.describe('Document body: markdown (```typst blocks allowed) or typst source'),
				mode: z.enum(['markdown', 'typst']).optional().describe("Defaults to 'markdown'"),
				workspaceId: z.string().optional().describe('Defaults to your personal workspace'),
				tags: z.array(z.string()).optional(),
				origin: z.string().optional().describe("Provenance label shown in the UI, e.g. 'perguntai'")
			}
		},
		async ({ title, source, mode, workspaceId, tags, origin }) => {
			const personal = personalWorkspaceId(access.principal.username);
			const ws = workspaceId ?? personal;
			if (!access.can(ws, 'editor')) return fail(`Requires editor access to ${ws}`);
			// A token-only caller may never have hit the login path that creates it.
			if (ws === personal) await ensureWorkspace(ws, access.principal.username, 'personal');

			ensureDraftSweeper();
			const doc = await createDoc({
				workspaceId: ws,
				title,
				mode: mode ?? 'markdown',
				source,
				tags,
				actor: access.principal.username,
				ephemeral: true,
				origin: origin ?? 'mcp'
			});
			return ok({
				id: doc.id,
				workspaceId: doc.workspaceId,
				slug: doc.slug,
				title: doc.title,
				rev: doc.rev,
				lines: lineCount(source),
				expiresInDays: DRAFT_TTL_DAYS
			});
		}
	);

	server.registerTool(
		'list_drafts',
		{
			title: 'List drafts',
			description:
				'Your live drafts, oldest first, with when each expires. Drafts appear nowhere else — not in list_docs, not in search.',
			inputSchema: {
				workspaceId: z.string().optional().describe('Defaults to your personal workspace')
			}
		},
		async ({ workspaceId }) => {
			const ws = workspaceId ?? personalWorkspaceId(access.principal.username);
			if (!access.can(ws)) return fail(`No access to workspace ${ws}`);
			const drafts = await listDrafts(ws);
			return ok(
				drafts.map((d) => ({
					id: d.id,
					slug: d.slug,
					title: d.title,
					mode: d.mode,
					chars: d.chars,
					origin: d.origin,
					updatedAt: d.updatedAt,
					expiresAt: d.expiresAt
				}))
			);
		}
	);

	server.registerTool(
		'patch_doc',
		{
			title: 'Patch a document',
			description:
				'Change part of a document without resending it. USE THIS FOR EVERY REVISION — fixing a compile error, rewording a section, adding a paragraph — instead of calling update_doc with the whole source again.\n' +
				'Two edit forms, and one call must use only one of them:\n' +
				'  • anchored — {oldText, newText}: exact substring replacement. oldText must appear EXACTLY once (whitespace included) unless you set replaceAll. Safest, because a stale anchor fails instead of landing in the wrong place.\n' +
				'  • line range — {startLine, endLine, newText}: 1-indexed, inclusive, numbered as read_doc shows them. Cheaper for replacing a whole block, since you do not resend the old text. Ranges must not overlap.\n' +
				'Pass expectedRev (from create_draft, read_doc or the last patch) and the call is rejected if anyone changed the document meanwhile, rather than overwriting their edit. Nothing is applied unless every edit applies: on failure you get diagnostics naming the edit that missed, and the document is untouched.',
			inputSchema: {
				id: z.string(),
				edits: z
					.array(
						z.union([
							z.object({
								oldText: z.string().min(1).describe('Exact text to replace'),
								newText: z.string().describe('Replacement (empty string deletes)'),
								replaceAll: z
									.boolean()
									.optional()
									.describe('Replace every occurrence instead of requiring exactly one')
							}),
							z.object({
								startLine: z.number().int().min(1).describe('First line to replace, 1-indexed'),
								endLine: z.number().int().min(1).describe('Last line to replace, inclusive'),
								newText: z.string().describe('Replacement lines (empty string deletes them)')
							})
						])
					)
					.min(1),
				expectedRev: z
					.number()
					.int()
					.optional()
					.describe('The rev you last saw. Omit only if you do not care about concurrent edits.'),
				title: z.string().optional().describe('Rename while patching')
			}
		},
		async ({ id, edits, expectedRev, title }) => {
			const found = await editableDoc(id);
			if (!found.ok) return found.result;
			const { doc } = found;

			if (expectedRev !== undefined && expectedRev !== doc.rev) {
				return failWith({
					error: 'rev_conflict',
					message: `Document is at rev ${doc.rev}, not ${expectedRev} — read_doc again and rebuild the patch`,
					rev: doc.rev
				});
			}

			const patched = applyEdits(doc.source, edits as Edit[]);
			if (!patched.ok) {
				return failWith({
					error: 'patch_failed',
					message: 'No edits were applied; the document is unchanged',
					rev: doc.rev,
					totalLines: lineCount(doc.source),
					diagnostics: patched.diagnostics
				});
			}

			try {
				const updated = await updateDoc(
					id,
					{ source: patched.source, ...(title ? { title } : {}) },
					access.principal.username,
					{ expectedRev }
				);
				await onDocUpdated(updated);
				return ok({
					id: updated.id,
					rev: updated.rev,
					applied: patched.applied,
					totalLines: lineCount(patched.source),
					chars: patched.source.length,
					ephemeral: updated.ephemeral
				});
			} catch (err) {
				if (err instanceof DocRevisionConflictError) {
					return failWith({
						error: 'rev_conflict',
						message: err.message,
						rev: err.actualRev
					});
				}
				throw err;
			}
		}
	);

	server.registerTool(
		'read_doc',
		{
			title: 'Read a document with line numbers',
			description:
				'The source with 1-indexed line numbers — how you recover after a failed patch, and how you find the line range to replace. Ask for a slice rather than the whole document when you only need one part. Returns the current rev to patch against.',
			inputSchema: {
				id: z.string(),
				fromLine: z.number().int().min(1).optional().describe('Defaults to 1'),
				toLine: z.number().int().min(1).optional().describe('Defaults to the last line')
			}
		},
		async ({ id, fromLine, toLine }) => {
			const doc = await getDoc(id);
			if (!doc) return fail(`Document not found: ${id}`);
			if (!doc.isPublic && !access.can(doc.workspaceId)) return fail('Access denied');
			const total = lineCount(doc.source);
			return ok({
				id: doc.id,
				title: doc.title,
				mode: doc.mode,
				rev: doc.rev,
				ephemeral: doc.ephemeral,
				totalLines: total,
				fromLine: fromLine ?? 1,
				toLine: Math.min(toLine ?? total, total),
				text: withLineNumbers(doc.source, fromLine ?? 1, toLine)
			});
		}
	);

	server.registerTool(
		'check_doc',
		{
			title: 'Check that a document compiles',
			description:
				'Compile a stored document and report errors WITHOUT producing a PDF. Call this after patching and before render_pdf: a failure here costs one small patch to fix, and you never hand a broken document downstream. Checks the document source itself — a custom template passed to render_pdf_custom is only exercised by that call.',
			inputSchema: { id: z.string() }
		},
		async ({ id }) => {
			const doc = await getDoc(id);
			if (!doc) return fail(`Document not found: ${id}`);
			if (!doc.isPublic && !access.can(doc.workspaceId)) return fail('Access denied');

			try {
				if (doc.mode === 'typst') await compileSvg(doc.source);
				else
					await renderMarkdown(doc.source, {
						workspaceId: doc.workspaceId,
						resolveRefs: resolveDocRefs
					});
				return ok({ id: doc.id, rev: doc.rev, mode: doc.mode, compiles: true });
			} catch (err) {
				if (err instanceof TypstCompileError) {
					// One input, so hand it in under both labels: typst compiles a stored
					// doc as __main__.typ and will call it "template" regardless of mode,
					// and either way the line to fix is in this source.
					return failWith({
						...explainCompileError(
							err.message,
							err.diagnostics,
							{ template: doc.source, document: doc.source },
							{
								nextStep:
									'Fix it with patch_doc (anchored on the text named in the message, or the line from candidateLines), then call check_doc again. Keep going until it compiles — do not hand a broken document to render_pdf, and do not give up on it.'
							}
						),
						compiles: false,
						rev: doc.rev,
						totalLines: lineCount(doc.source)
					});
				}
				return failWith({
					error: 'render_failed',
					compiles: false,
					rev: doc.rev,
					message: err instanceof Error ? err.message : 'render failed'
				});
			}
		}
	);

	server.registerTool(
		'revert_doc',
		{
			title: 'Undo the last patch to a draft',
			description:
				'Restore the source a draft had before its most recent patch. Drafts keep exactly one undo step, and reverting is itself undoable, so a mistaken revert costs nothing. Drafts only — ordinary documents have full version history instead.',
			inputSchema: { id: z.string() }
		},
		async ({ id }) => {
			const found = await editableDoc(id);
			if (!found.ok) return found.result;
			try {
				const doc = await revertDraft(id, access.principal.username);
				return ok({
					id: doc.id,
					rev: doc.rev,
					totalLines: lineCount(doc.source),
					chars: doc.source.length
				});
			} catch (err) {
				if (err instanceof DraftUndoUnavailableError) return fail(err.message);
				throw err;
			}
		}
	);

	server.registerTool(
		'keep_doc',
		{
			title: 'Keep a draft as a real document',
			description:
				'Promote a draft into an ordinary document: it stops expiring, becomes searchable and listed, and starts recording version history from this point. Call this when the user says to save or keep the document. Harmless on a document that is already permanent.',
			inputSchema: {
				id: z.string().optional(),
				workspaceId: z.string().optional(),
				slug: z.string().optional()
			}
		},
		async ({ id, workspaceId, slug }) => {
			const doc = id
				? await getDoc(id)
				: workspaceId && slug
					? await getDocBySlug(workspaceId, slug)
					: null;
			if (!doc) return fail('Document not found (provide id, or workspaceId + slug)');
			if (!access.can(doc.workspaceId, 'editor')) return fail('Requires editor access');

			const kept = await promoteDoc(doc.id, access.principal.username);
			return ok({
				id: kept.id,
				workspaceId: kept.workspaceId,
				slug: kept.slug,
				title: kept.title,
				rev: kept.rev,
				ephemeral: kept.ephemeral
			});
		}
	);

	server.registerTool(
		'get_published_doc',
		{
			title: 'Get a published document',
			description:
				'Fetch what the wiki actually serves for a public slug: the approved snapshot, which may be older than the live source under review.',
			inputSchema: { publicSlug: z.string() }
		},
		async ({ publicSlug }) => {
			const hit = await getPublishedDoc(publicSlug);
			if (!hit) return fail('No published document under that slug');
			return ok({
				id: hit.doc.id,
				workspaceId: hit.doc.workspaceId,
				publicSlug: hit.doc.publicSlug,
				title: hit.title,
				mode: hit.doc.mode,
				tags: hit.doc.tags,
				publishedVersionNo: hit.doc.publishedVersionNo,
				source: hit.source
			});
		}
	);

	server.registerTool(
		'request_publish',
		{
			title: 'Request publication',
			description:
				'Publish a document to the wiki, or open a review when workspace policy requires approval. Returns published, pending, or forbidden.',
			inputSchema: {
				id: z.string().optional(),
				workspaceId: z.string().optional(),
				slug: z.string().optional()
			}
		},
		async ({ id, workspaceId, slug }) => {
			const doc = id
				? await getDoc(id)
				: workspaceId && slug
					? await getDocBySlug(workspaceId, slug)
					: null;
			if (!doc) return fail('Document not found (provide id, or workspaceId + slug)');
			if (!access.can(doc.workspaceId, 'editor')) return fail('Requires editor access');
			if (doc.ephemeral) {
				return fail('That is a draft and would expire — call keep_doc first, then publish');
			}
			const outcome = await requestPublish(doc, access);
			const fresh = outcome === 'published' ? await getDoc(doc.id) : null;
			return ok({
				outcome,
				publicSlug: fresh?.publicSlug ?? null
			});
		}
	);

	server.registerTool(
		'list_templates',
		{
			title: 'List export templates',
			description:
				'Templates available for render_pdf in a workspace, with what each is for and the options it accepts. Call this before render_pdf to choose one.',
			inputSchema: { workspaceId: z.string() }
		},
		async ({ workspaceId }) => {
			if (!access.can(workspaceId)) return fail(`No access to workspace ${workspaceId}`);
			const templates = await listTemplates(workspaceId);
			return ok(
				templates.map((t) => {
					const meta = parseTemplateMeta(t.source);
					return {
						slug: t.slug,
						name: t.name,
						description: meta.description,
						options: meta.options.map((o) => ({
							key: o.key,
							type: o.type,
							default: o.default,
							help: o.help
						}))
					};
				})
			);
		}
	);

	async function renderToResult(args: {
		workspaceId: string;
		content: string;
		wrapper: string | undefined;
		templateSlug: string | null;
		title?: string;
		options?: Record<string, string>;
		tags?: string[];
		inline?: boolean;
	}): Promise<ToolResult> {
		const heading = (args.title ?? '').trim() || 'Documento';
		const inputs = subjectInputs(
			{
				title: heading,
				slug: slugify(heading) || 'documento',
				tags: args.tags ?? [],
				workspaceId: args.workspaceId,
				date: new Date(),
				author: await formalNameFor(access.principal.username)
			},
			args.options ?? {}
		);

		let rendered: { pdf: Uint8Array; key: string };
		try {
			rendered = await renderMarkdownToPdfKeyed(args.content, {
				workspaceId: args.workspaceId,
				resolveRefs: resolveDocRefs,
				wrapper: args.wrapper,
				inputs
			});
		} catch (err) {
			if (err instanceof TypstCompileError) {
				// The diagnostics are the whole point: a bare "compilation failed"
				// leaves the caller nothing to fix and it gives up on the document.
				return failWith(
					explainCompileError(err.message, err.diagnostics, {
						template: args.wrapper,
						document: args.content
					})
				);
			}
			throw err;
		}

		const filename = `${inputs.slug}.pdf`;

		if (args.inline) {
			return {
				content: [
					{
						type: 'resource',
						resource: {
							uri: `tabula://render/${filename}`,
							mimeType: 'application/pdf',
							blob: Buffer.from(rendered.pdf).toString('base64')
						}
					}
				]
			} as unknown as ToolResult;
		}

		const { token, expiresAt } = signArtifact(rendered.key, filename);
		return ok({
			url: `${origin()}/api/artifact/${token}`,
			filename,
			mimeType: 'application/pdf',
			bytes: rendered.pdf.byteLength,
			expiresAt: expiresAt.toISOString(),
			template: args.templateSlug
		});
	}

	/**
	 * Where the body of a render comes from: a stored document, or literal content.
	 * `docId` is the cheap path — the source never leaves the server, so a long
	 * document costs nothing to render and nothing to re-render after a fix.
	 */
	async function renderBody(args: {
		docId?: string;
		content?: string;
		workspaceId?: string;
		title?: string;
	}): Promise<
		| { ok: true; workspaceId: string; content: string; title?: string }
		| { ok: false; result: ToolResult }
	> {
		if (args.docId && args.content) {
			return { ok: false, result: fail('Pass either docId or content, not both') };
		}
		if (args.docId) {
			const doc = await getDoc(args.docId);
			if (!doc) return { ok: false, result: fail(`Document not found: ${args.docId}`) };
			if (!doc.isPublic && !access.can(doc.workspaceId)) {
				return { ok: false, result: fail('Access denied') };
			}
			return {
				ok: true,
				// Templates and branding follow the document unless told otherwise.
				workspaceId: args.workspaceId ?? doc.workspaceId,
				content: doc.source,
				title: args.title ?? doc.title
			};
		}
		if (!args.content) return { ok: false, result: fail('Pass docId or content') };
		if (!args.workspaceId) {
			return { ok: false, result: fail('workspaceId is required when passing content') };
		}
		if (!access.can(args.workspaceId)) {
			return { ok: false, result: fail(`No access to workspace ${args.workspaceId}`) };
		}
		return {
			ok: true,
			workspaceId: args.workspaceId,
			content: args.content,
			title: args.title
		};
	}

	server.registerTool(
		'render_pdf',
		{
			title: 'Render a PDF',
			description:
				'Compile a document into a PDF with one of the workspace templates. Nothing is stored as a document: the result is a short-lived signed link the caller can download, or base64 bytes when inline is true. Use list_templates first to pick a template and learn its options. Stored templates are fixed layouts (A4 portrait, corporate chrome) — for any other page format, size, orientation, or free-form composition you MUST use render_pdf_custom with an ephemeral template instead.\n' +
				'PREFER docId over content. With docId the source is read on the server, so a long document costs nothing to send and nothing to send again after a fix; pass content only for a short one-off you have not stored.\n' +
				'If it fails to compile you get diagnostics naming the fault and the input it is in. Fix that and call this again — typst reports one error at a time, so iterate until it renders rather than reporting failure to the user.',
			inputSchema: {
				docId: z
					.string()
					.optional()
					.describe('Render a stored document (from create_draft). Preferred over content.'),
				content: z
					.string()
					.min(1)
					.optional()
					.describe('Literal body in markdown; ```typst blocks are allowed. Use docId instead when you can.'),
				workspaceId: z
					.string()
					.optional()
					.describe(
						'Workspace whose templates and branding apply. Required with content; defaults to the document’s own workspace with docId.'
					),
				title: z.string().optional().describe('Shown on the cover and in the header'),
				template: z.string().optional().describe('Template slug; omit for a plain layout'),
				options: z
					.record(z.string())
					.optional()
					.describe('Template option values, keyed as declared by list_templates'),
				tags: z.array(z.string()).optional(),
				inline: z
					.boolean()
					.optional()
					.describe('Return base64 bytes instead of a link. Large, so prefer the link.')
			}
		},
		async ({ docId, workspaceId, content, title, template, options, tags, inline }) => {
			const body = await renderBody({ docId, content, workspaceId, title });
			if (!body.ok) return body.result;

			const tpl = template ? await getTemplate(body.workspaceId, template) : null;
			if (template && !tpl) return fail(`Unknown template "${template}" in ${body.workspaceId}`);

			return renderToResult({
				workspaceId: body.workspaceId,
				content: body.content,
				wrapper: tpl?.source,
				templateSlug: tpl?.slug ?? null,
				title: body.title,
				options,
				tags,
				inline
			});
		}
	);

	server.registerTool(
		'render_pdf_custom',
		{
			title: 'Render a PDF with an ephemeral template',
			description:
				'ON FAILURE, ITERATE — DO NOT GIVE UP. A failed compile returns diagnostics naming the fault and which input it is in (template vs document), plus candidate lines. typst reports only the FIRST error and gives no line numbers, so fix that one thing and call this tool again; a second error appearing is normal progress, not a wall. Never respond that the document cannot be produced without having retried, and never fall back to resending the whole body.\n' +
				'Compile markdown into a PDF using a one-off Typst template supplied in this call — nothing is stored, so this is how you COMPOSE layouts render_pdf cannot produce. Any different page format (A5, landscape, slides, labels, custom margins), custom typography, or free-form design REQUIRES an ephemeral template like this; the stored workspace templates are fixed and cannot be altered per call. Contract: templateSource is a complete Typst document that renders the markdown itself, typically ending in `#import "@preview/cmarker:0.1.6"` … `#cmarker.render(read("/doc.md"), raw-typst: true, scope: (image: (path, alt: none) => image(path, alt: alt)))` — content arrives at /doc.md, the image scope handler is required when the markdown references attachments, and metadata (title, author, date, tags, plus every key from options as fm-style strings) arrives via sys.inputs with defaults, e.g. `#let title = sys.inputs.at("title", default: "")`. ```typst blocks inside the content still work. Result is a short-lived signed link, or base64 bytes when inline is true.',
			inputSchema: {
				docId: z
					.string()
					.optional()
					.describe('Render a stored document (from create_draft). Preferred over content.'),
				content: z
					.string()
					.min(1)
					.optional()
					.describe('Literal body in markdown; ```typst blocks are allowed. Use docId instead when you can.'),
				workspaceId: z
					.string()
					.optional()
					.describe(
						'Workspace whose branding and attachments apply. Required with content; defaults to the document’s own workspace with docId.'
					),
				templateSource: z
					.string()
					.min(1)
					.describe('Complete Typst template source; must render /doc.md itself (see tool description)'),
				title: z.string().optional().describe('Reaches the template as sys.inputs title'),
				options: z
					.record(z.string())
					.optional()
					.describe('Extra sys.inputs values the template may read'),
				tags: z.array(z.string()).optional(),
				inline: z
					.boolean()
					.optional()
					.describe('Return base64 bytes instead of a link. Large, so prefer the link.')
			}
		},
		async ({ docId, workspaceId, content, templateSource, title, options, tags, inline }) => {
			const body = await renderBody({ docId, content, workspaceId, title });
			if (!body.ok) return body.result;
			return renderToResult({
				workspaceId: body.workspaceId,
				content: body.content,
				wrapper: templateSource,
				templateSlug: null,
				title: body.title,
				options,
				tags,
				inline
			});
		}
	);

	server.registerTool(
		'get_backlinks',
		{
			title: 'Get backlinks',
			description: 'List documents that link to the given document.',
			inputSchema: { id: z.string() }
		},
		async ({ id }) => {
			const doc = await getDoc(id);
			if (!doc) return fail('Document not found');
			if (!doc.isPublic && !access.can(doc.workspaceId)) return fail('Access denied');
			// Only backlinks the caller could open: private siblings stay invisible.
			const back = (await getBacklinks(doc)).filter(
				(d) => d.isPublic || access.can(d.workspaceId)
			);
			return ok(back.map((d) => ({ id: d.id, workspaceId: d.workspaceId, slug: d.slug, title: d.title })));
		}
	);

	return server;
}
