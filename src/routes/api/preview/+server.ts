import { json, type RequestHandler } from '@sveltejs/kit';
import { requireRole } from '$lib/server/apiGuards';
import { resolveDocRefs } from '$lib/server/docs';
import { renderMarkdown } from '$lib/server/markdown';
import { compileSvg, TypstCompileError } from '$lib/server/typst';

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		workspaceId?: string;
		mode?: string;
		source?: string;
	};
	const workspaceId = body.workspaceId ?? '';
	requireRole(locals, workspaceId, 'editor');

	const source = body.source ?? '';
	try {
		if (body.mode === 'typst') {
			return json({ html: (await compileSvg(source)).svg });
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
