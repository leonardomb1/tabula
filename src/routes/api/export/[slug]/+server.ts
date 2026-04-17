import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import { renderPdf } from '$lib/server/pdf';
import { getDoc } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import { readBranding } from '$lib/branding';
import type { RequestHandler } from './$types';

const PANDOC_CSS = `
body{max-width:740px;margin:2rem auto;padding:0 1.5rem 4rem;font-family:'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif;font-size:1.1rem;line-height:1.75;color:#1a1a1a;background:#fffff8}
h1{font-size:2rem;font-weight:700;border-bottom:1px solid #e0ddd5;padding-bottom:.4em;margin:0 0 .25em}
h2{font-size:1.45rem;font-weight:600;border-bottom:1px solid #e8e5df;padding-bottom:.25em;margin:2.2em 0 .6em}
h3{font-size:1.2rem;font-weight:600;margin:1.8em 0 .5em}
a{color:var(--brand);text-decoration:none;border-bottom:1px solid color-mix(in srgb, var(--brand) 25%, transparent)}
pre{background:#1e1e1e;color:#d4d4d4;border-radius:6px;padding:1em 1.2em;overflow-x:auto;font-size:.85rem}
code{font-family:ui-monospace,monospace;font-size:.875em;background:#f5f2eb;padding:.15em .35em;border-radius:3px;color:#b5470d}
pre code{background:none;color:inherit;padding:0}
blockquote{border-left:4px solid #d1c9b0;margin:1.5em 0;padding:.1em 0 .1em 1.25em;color:#555;font-style:italic}
table{width:100%;border-collapse:collapse;margin:1.5em 0}
th{background:#f5f2eb;font-weight:600;padding:.5em .85em;border:1px solid #d1c9b0;text-align:left}
td{padding:.45em .85em;border:1px solid #e0ddd5}
hr{border:none;border-top:1px solid #e0ddd5;margin:2.5em 0}
img{max-width:100%;border-radius:4px}
`;

export const GET: RequestHandler = async ({ params, url }) => {
	const { slug } = params;
	if (!/^[a-zA-Z0-9_-]+$/.test(slug)) error(400, 'Slug inválido');
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;

	const doc = await getDoc(wsId, slug);
	if (!doc) error(404, 'Documento não encontrado');

	const source = doc.source;
	const format = url.searchParams.get('format') ?? 'md';

	if (format === 'md') {
		return new Response(source, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Content-Disposition': `attachment; filename="${slug}.md"`
			}
		});
	}

	const { html, toc, title, frontmatter } = renderMarkdown(source);

	// PDF export — Puppeteer formal document
	if (format === 'pdf') {
		if (!frontmatter.formal) error(403, 'Apenas documentos formais podem ser exportados como PDF');
		// QR code only when the doc is public AND has qrCode: true in frontmatter
		const docUrl = (frontmatter.public && frontmatter.qrCode)
			? `${url.origin}/public/${slug}`
			: undefined;
		const pdf = await renderPdf(
			{
				title,
				author: frontmatter.author,
				date: frontmatter.date,
				version: frontmatter.version,
				doctype: frontmatter.doctype,
				tags: frontmatter.tags,
				footer: frontmatter.footer,
				approvals: frontmatter.approvals,
				cover: frontmatter.cover,
				coverImage: frontmatter.coverImage,
				confidential: frontmatter.confidential,
				company: frontmatter.company,
				docUrl,
			},
			html,
			toc,
			wsId
		);
		return new Response(new Uint8Array(pdf), {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${slug}.pdf"`,
			},
		});
	}

	// HTML export — self-contained with embedded CSS
	const fullHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"/>
<style>:root { --brand: ${readBranding().color}; } ${PANDOC_CSS}</style>
</head>
<body>${html}</body>
</html>`;

	return new Response(fullHtml, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Disposition': `attachment; filename="${slug}.html"`
		}
	});
};
