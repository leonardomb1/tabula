import { error, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { getAttachment } from '$lib/server/attachments';
import { storage } from '$lib/server/storage';

export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	const a = await getAttachment(params.id ?? '');
	if (!a) throw error(404, 'not found');

	// Public attachments (referenced by a published doc) serve without a session
	// so the wiki works anonymously. The short public max-age bounds how long a
	// CDN keeps serving after an unpublish flips the flag back.
	let cacheControl = 'public, max-age=600';
	if (!a.isPublic) {
		const { access } = requireUser(locals);
		if (!access.can(a.workspaceId)) throw error(403, 'access denied');
		cacheControl = 'private, max-age=31536000, immutable';
	}

	const bytes = await storage().tryReadBinary(a.storageKey);
	if (!bytes) throw error(404, 'not found');

	setHeaders({
		'content-type': a.contentType,
		'content-length': String(bytes.byteLength),
		'content-disposition': `inline; filename="${a.filename.replace(/"/g, '')}"`,
		'cache-control': cacheControl,
		'x-content-type-options': 'nosniff'
	});
	return new Response(bytes as unknown as BodyInit);
};
