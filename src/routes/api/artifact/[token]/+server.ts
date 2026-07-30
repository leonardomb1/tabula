import { error, type RequestHandler } from '@sveltejs/kit';
import { verifyArtifact } from '$lib/server/artifacts';
import { storage } from '$lib/server/storage';
import { isPdfCacheKey } from '$lib/server/typst';

/**
 * Serves a rendered artifact to whoever holds a valid signed token. Deliberately
 * unauthenticated: the token is the capability, granted when it was minted.
 *
 * Everything unresolvable answers 404 — a tampered token, an expired one and a
 * missing object are indistinguishable from outside, so nothing here confirms that
 * a given key exists.
 */
export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const claim = verifyArtifact(params.token ?? '');
	if (!claim) throw error(404, 'not found');

	// Second gate behind the signature: only keys this app renders into, so a
	// forged payload could never address arbitrary objects in the bucket.
	if (!isPdfCacheKey(claim.storageKey)) throw error(404, 'not found');

	const bytes = await storage().tryReadBinary(claim.storageKey);
	if (!bytes) throw error(404, 'not found');

	const filename = (claim.filename ?? 'document.pdf').replace(/[^\w.-]+/g, '_');
	setHeaders({
		'content-type': 'application/pdf',
		'content-length': String(bytes.byteLength),
		'content-disposition': `inline; filename="${filename}"`,
		'cache-control': 'private, no-store'
	});
	return new Response(bytes as unknown as BodyInit);
};
