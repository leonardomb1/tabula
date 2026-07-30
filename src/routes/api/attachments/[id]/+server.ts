import { error, type RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/apiGuards';
import { getAttachment, referencedByPublicDoc } from '$lib/server/attachments';
import { storage } from '$lib/server/storage';

export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	const { access } = requireUser(locals);

	const a = await getAttachment(params.id ?? '');
	if (!a) throw error(404, 'not found');
	if (!access.can(a.workspaceId) && !(await referencedByPublicDoc(a))) {
		throw error(403, 'access denied');
	}

	const bytes = await storage().tryReadBinary(a.storageKey);
	if (!bytes) throw error(404, 'not found');

	setHeaders({
		'content-type': a.contentType,
		'content-length': String(bytes.byteLength),
		'content-disposition': `inline; filename="${a.filename.replace(/"/g, '')}"`,
		'cache-control': 'private, max-age=31536000, immutable',
		'x-content-type-options': 'nosniff'
	});
	return new Response(bytes as unknown as BodyInit);
};
