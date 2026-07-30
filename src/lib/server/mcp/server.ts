import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Access } from '../access';
import { searchDocs } from '../search';
import { getDoc, getDocBySlug, listDocs, getBacklinks, resolveDocRefs } from '../docs';
import { getPublishedDoc, openReview, requestPublish } from '../publication';
import { listWorkspaces } from '../workspaces';
import { getTemplate, listTemplates, parseTemplateMeta, subjectInputs } from '../templates';
import { renderMarkdownToPdfKeyed } from '../markdown/pdf';
import { TypstCompileError } from '../typst';
import { signArtifact } from '../artifacts';
import { formalNameFor } from '../userSettings';
import { slugify } from '../ids';

/**
 * Absolute base for links handed to a caller. ORIGIN is what adapter-node already
 * uses to build absolute URLs, so an artifact link matches the host the service
 * reaches tabula on.
 */
function origin(): string {
	return (process.env.ORIGIN ?? 'http://localhost:3000').replace(/\/+$/, '');
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
	content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
});
const fail = (message: string): ToolResult => ({
	content: [{ type: 'text', text: message }],
	isError: true
});

export function buildMcpServer(access: Access): McpServer {
	const server = new McpServer(
		{ name: 'tabula', version: '0.1.0' },
		{ capabilities: { tools: {} }, instructions: 'Search and read tabula documentation.' }
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
			description: 'List documents in a workspace the caller can access.',
			inputSchema: { workspaceId: z.string() }
		},
		async ({ workspaceId }) => {
			if (!access.can(workspaceId)) return fail(`No access to workspace ${workspaceId}`);
			const docs = await listDocs(workspaceId);
			return ok(
				docs.map((d) => ({
					id: d.id,
					slug: d.slug,
					title: d.title,
					mode: d.mode,
					isPublic: d.isPublic,
					publicSlug: d.publicSlug
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
			const pending = await openReview(doc.id, 'publish');
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
			if (err instanceof TypstCompileError) return fail(`Template failed to compile: ${err.message}`);
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

	server.registerTool(
		'render_pdf',
		{
			title: 'Render a PDF',
			description:
				'Compile markdown into a PDF with one of the workspace templates. Nothing is stored as a document: the result is a short-lived signed link the caller can download, or base64 bytes when inline is true. Use list_templates first to pick a template and learn its options. Stored templates are fixed layouts (A4 portrait, corporate chrome) — for any other page format, size, orientation, or free-form composition you MUST use render_pdf_custom with an ephemeral template instead.',
			inputSchema: {
				workspaceId: z.string().describe('Workspace whose templates and branding apply'),
				content: z.string().min(1).describe('Document body in markdown; ```typst blocks are allowed'),
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
		async ({ workspaceId, content, title, template, options, tags, inline }) => {
			if (!access.can(workspaceId)) return fail(`No access to workspace ${workspaceId}`);

			const tpl = template ? await getTemplate(workspaceId, template) : null;
			if (template && !tpl) return fail(`Unknown template "${template}" in ${workspaceId}`);

			return renderToResult({
				workspaceId,
				content,
				wrapper: tpl?.source,
				templateSlug: tpl?.slug ?? null,
				title,
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
				'Compile markdown into a PDF using a one-off Typst template supplied in this call — nothing is stored, so this is how you COMPOSE layouts render_pdf cannot produce. Any different page format (A5, landscape, slides, labels, custom margins), custom typography, or free-form design REQUIRES an ephemeral template like this; the stored workspace templates are fixed and cannot be altered per call. Contract: templateSource is a complete Typst document that renders the markdown itself, typically ending in `#import "@preview/cmarker:0.1.6"` … `#cmarker.render(read("/doc.md"), raw-typst: true, scope: (image: (path, alt: none) => image(path, alt: alt)))` — content arrives at /doc.md, the image scope handler is required when the markdown references attachments, and metadata (title, author, date, tags, plus every key from options as fm-style strings) arrives via sys.inputs with defaults, e.g. `#let title = sys.inputs.at("title", default: "")`. ```typst blocks inside the content still work. Result is a short-lived signed link, or base64 bytes when inline is true.',
			inputSchema: {
				workspaceId: z.string().describe('Workspace whose branding and attachments apply'),
				content: z.string().min(1).describe('Document body in markdown; ```typst blocks are allowed'),
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
		async ({ workspaceId, content, templateSource, title, options, tags, inline }) => {
			if (!access.can(workspaceId)) return fail(`No access to workspace ${workspaceId}`);
			return renderToResult({
				workspaceId,
				content,
				wrapper: templateSource,
				templateSlug: null,
				title,
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
