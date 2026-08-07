import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getDoc } from '$lib/server/docs';
import { recordView } from '$lib/server/views';
import { wikiMode } from '$lib/server/wiki';

/**
 * Counts one read, called by the page after it renders. Deliberately not done
 * in the page load: the app preloads data on link hover, so loads fire for
 * documents nobody opened.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => ({}))) as { id?: string; source?: string };
	const source = body.source === 'wiki' ? 'wiki' : 'app';
	if (!body.id) throw error(400, 'id is required');

	const doc = await getDoc(body.id);
	if (!doc || doc.deletedAt) throw error(404, 'not found');

	if (source === 'wiki') {
		if (wikiMode() === 'off' || !doc.isPublic) throw error(404, 'not found');
	} else if (!locals.access?.can(doc.workspaceId)) {
		throw error(403, 'forbidden');
	}

	recordView(doc.id, source);
	return json({ ok: true });
};
