import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getDocBySlug } from '$lib/server/docs';

/** Card data for wiki-link hover previews. */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	const doc = await getDocBySlug(params.ws ?? '', params.slug ?? '');
	if (!doc) error(404, 'not found');
	if (!doc.isPublic && !locals.access?.can(doc.workspaceId)) error(403, 'forbidden');

	setHeaders({ 'cache-control': 'private, max-age=60' });
	const text = doc.bodyText.replace(/\s+/g, ' ').trim();
	return json({
		title: doc.title,
		excerpt: text.length > 260 ? `${text.slice(0, 260)}…` : text,
		tags: doc.tags,
		updatedAt: doc.updatedAt
	});
};
