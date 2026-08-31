import { json, type RequestHandler } from '@sveltejs/kit';
import { requireRole } from '$lib/server/apiGuards';
import { resolveDocRefs } from '$lib/server/docs';
import { parseFrontmatter, renderMarkdown } from '$lib/server/markdown';
import { renderMarkdownToSvg } from '$lib/server/markdown/pdf';
import { getTemplate, subjectInputs } from '$lib/server/templates';
import { formalNameFor } from '$lib/server/userSettings';
import { compileSvg, TypstCompileError } from '$lib/server/typst';

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		workspaceId?: string;
		mode?: string;
		source?: string;
		template?: string;
		title?: string;
		slug?: string;
		tags?: string[];
	};
	const workspaceId = body.workspaceId ?? '';
	const { user } = requireRole(locals, workspaceId, 'editor');

	const source = body.source ?? '';
	try {
		if (body.mode === 'typst') {
			const { svg, pages } = await compileSvg(source);
			return json({ svg, pages });
		}

		const templateSlug = body.template?.trim() ?? '';
		if (templateSlug) {
			const template = await getTemplate(workspaceId, templateSlug);
			if (!template) return json({ error: `unknown template "${templateSlug}"` });
			const inputs = subjectInputs({
				title: body.title ?? '',
				slug: body.slug ?? '',
				tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
				workspaceId,
				date: new Date(),
				author: await formalNameFor(user.username),
				frontmatter: parseFrontmatter(source).data
			});
			const { svg, pages } = await renderMarkdownToSvg(source, {
				workspaceId,
				resolveRefs: resolveDocRefs,
				wrapper: template.source,
				inputs
			});
			return json({ svg, pages });
		}

		const rendered = await renderMarkdown(source, { workspaceId, resolveRefs: resolveDocRefs });
		return json({ html: rendered.html });
	} catch (err) {
		const message =
			err instanceof TypstCompileError
				? `${err.message}\n${JSON.stringify(err.diagnostics, null, 2)}`
				: err instanceof Error
					? err.message
					: 'render failed';
		return json({ error: message }, { status: 200 });
	}
};
