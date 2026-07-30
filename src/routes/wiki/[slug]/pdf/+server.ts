import { error, type RequestHandler } from '@sveltejs/kit';
import { getPublishedDoc } from '$lib/server/publication';
import { resolvePublicDocRefs } from '$lib/server/docs';
import { renderMarkdownToPdf } from '$lib/server/markdown/pdf';
import { getOrCompilePdf, TypstCompileError } from '$lib/server/typst';
import { resolveTemplate, templateInputs } from '$lib/server/templates';
import { wikiMode } from '$lib/server/wiki';

/**
 * Anonymous-safe by construction: the snapshot source, the doc's own default
 * template, and no caller-controlled inputs — one cache key per published
 * version, so unauthenticated traffic cannot force unbounded compiles.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	const mode = wikiMode();
	if (mode === 'off') throw error(404, 'not found');
	if (mode === 'org' && !locals.user) throw error(401, 'authentication required');

	const hit = await getPublishedDoc(params.slug ?? '');
	if (!hit) throw error(404, 'not found');
	const { doc, source } = hit;

	const template = await resolveTemplate(doc, null);
	const inputs = await templateInputs(doc);

	let pdf: Uint8Array;
	try {
		pdf =
			doc.mode === 'markdown'
				? await renderMarkdownToPdf(source, {
						workspaceId: doc.workspaceId,
						resolveRefs: resolvePublicDocRefs,
						wrapper: template?.source,
						inputs
					})
				: await getOrCompilePdf(source, { inputs });
	} catch (err) {
		if (err instanceof TypstCompileError) throw error(422, 'render failed');
		throw err;
	}

	setHeaders({
		'content-type': 'application/pdf',
		'content-disposition': `inline; filename="${(doc.publicSlug ?? doc.slug).replace(/"/g, '')}.pdf"`,
		'cache-control': 'public, max-age=600'
	});
	return new Response(pdf as unknown as BodyInit);
};
