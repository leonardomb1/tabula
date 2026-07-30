import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Access } from '../access';
import { searchDocs } from '../search';
import { getDoc, getDocBySlug, listDocs, getBacklinks, resolveDocRefs } from '../docs';
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
			return ok(docs.map((d) => ({ id: d.id, slug: d.slug, title: d.title, mode: d.mode })));
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
			return ok({
				id: doc.id,
				workspaceId: doc.workspaceId,
				slug: doc.slug,
				title: doc.title,
				mode: doc.mode,
				tags: doc.tags,
				updatedAt: doc.updatedAt,
				source: doc.source
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

	server.registerTool(
		'render_pdf',
		{
			title: 'Render a PDF',
			description:
				'Compile markdown into a PDF with one of the workspace templates. Nothing is stored as a document: the result is a short-lived signed link the caller can download, or base64 bytes when inline is true. Use list_templates first to pick a template and learn its options.',
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

			const heading = (title ?? '').trim() || 'Documento';
			const inputs = subjectInputs(
				{
					title: heading,
					slug: slugify(heading) || 'documento',
					tags: tags ?? [],
					workspaceId,
					date: new Date(),
					author: await formalNameFor(access.principal.username)
				},
				options ?? {}
			);

			let rendered: { pdf: Uint8Array; key: string };
			try {
				rendered = await renderMarkdownToPdfKeyed(content, {
					workspaceId,
					resolveRefs: resolveDocRefs,
					wrapper: tpl?.source,
					inputs
				});
			} catch (err) {
				if (err instanceof TypstCompileError) return fail(`Template failed to compile: ${err.message}`);
				throw err;
			}

			const filename = `${inputs.slug}.pdf`;

			if (inline) {
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
				template: tpl?.slug ?? null
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
			const back = await getBacklinks(doc);
			return ok(back.map((d) => ({ id: d.id, workspaceId: d.workspaceId, slug: d.slug, title: d.title })));
		}
	);

	return server;
}
