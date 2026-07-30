import { error, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { getDoc, resolveDocRefs } from '$lib/server/docs';
import { getOrCompilePdf, TypstCompileError } from '$lib/server/typst';
import { renderMarkdownToPdf } from '$lib/server/markdown/pdf';
import { resolveTemplate, templateInputs } from '$lib/server/templates';

export const GET: RequestHandler = async ({ params, locals, url, setHeaders }) => {
	const { access } = requireUser(locals);
	const doc = await getDoc(params.id ?? '');
	if (!doc) throw error(404, 'not found');
	if (!doc.isPublic && !access.can(doc.workspaceId, 'viewer')) throw error(403, 'forbidden');

	const template = await resolveTemplate(doc, url.searchParams.get('template'));

	const overrides: Record<string, string> = {};
	for (const [key, value] of url.searchParams) {
		if (key.startsWith('opt.')) overrides[key.slice(4)] = value;
	}

	const inputs = await templateInputs(doc, overrides);

	let pdf: Uint8Array;
	try {
		pdf =
			doc.mode === 'markdown'
				? await renderMarkdownToPdf(doc.source, {
						workspaceId: doc.workspaceId,
						resolveRefs: resolveDocRefs,
						wrapper: template?.source,
						inputs
					})
				: await getOrCompilePdf(doc.source, { inputs });
	} catch (err) {
		if (err instanceof TypstCompileError) {
			throw error(422, `template "${template?.slug ?? 'default'}" failed: ${err.message}`);
		}
		throw err;
	}

	setHeaders({
		'content-type': 'application/pdf',
		'content-disposition': `inline; filename="${doc.slug}.pdf"`
	});
	return new Response(pdf as unknown as BodyInit);
};
