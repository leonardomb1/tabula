import { json, error, type RequestHandler } from '@sveltejs/kit';
import { requireRole } from '$lib/server/apiGuards';
import { attachmentUrl, createAttachment } from '$lib/server/attachments';

const MAX_BYTES = Number(process.env.BODY_SIZE_LIMIT || 33554432);

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user } = requireRole(locals, params.ws ?? '', 'editor');

	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File) || file.size === 0) throw error(400, 'multipart field "file" is required');
	// SVG can carry scripts and the file is served back inline — images only, no SVG.
	if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
		throw error(415, 'only raster images are accepted');
	}
	if (file.size > MAX_BYTES) throw error(413, 'file too large');

	const a = await createAttachment({
		workspaceId: params.ws ?? '',
		filename: file.name || 'pasted.png',
		contentType: file.type,
		data: new Uint8Array(await file.arrayBuffer()),
		actor: user.username
	});
	return json({ id: a.id, url: attachmentUrl(a.id), filename: a.filename, size: a.size }, { status: 201 });
};
