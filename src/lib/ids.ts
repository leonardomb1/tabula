/**
 * Opaque document ids — 10 chars of base62 from `crypto.getRandomValues`.
 *
 * Design notes:
 *   - 62^10 ≈ 8.4e17 distinct values → collision is effectively impossible
 *     at any realistic doc count (< 1 in 10^14 at a million docs).
 *   - No leading digit constraint. The validation regex used on the save
 *     path (`[a-zA-Z0-9_-]+`) already accepts these.
 *   - No external dependency — `nanoid` would work identically but we
 *     don't need another package for 12 lines of crypto.
 *
 * Back-compat: legacy human-readable slugs (e.g. `frontmatter-guide`) are
 * still valid document ids. Old links keep working; this just changes how
 * *new* ids are minted.
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function newDocId(length = 10): string {
	const buf = crypto.getRandomValues(new Uint8Array(length));
	let out = '';
	for (const b of buf) out += ALPHABET[b % ALPHABET.length];
	return out;
}

/**
 * Decorative URL suffix derived from a doc title — Wikipedia/Medium style.
 * The id is the resolver; this segment is cosmetic and can go stale without
 * breaking links. Strips diacritics, lowercases, kebab-joins, caps at 60
 * chars on a word boundary.
 */
export function slugifyTitle(title: string, max = 60): string {
	const stripped = title
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (stripped.length <= max) return stripped;
	const cut = stripped.slice(0, max);
	const lastDash = cut.lastIndexOf('-');
	return lastDash > max * 0.6 ? cut.slice(0, lastDash) : cut;
}

export function docPath(wsId: string, slug: string, title?: string | null): string {
	const tail = title ? `/${slugifyTitle(title)}` : '';
	return `/w/${wsId}/${slug}${tail}`;
}

export function publicPath(slug: string, title?: string | null): string {
	const tail = title ? `/${slugifyTitle(title)}` : '';
	return `/public/${slug}${tail}`;
}
