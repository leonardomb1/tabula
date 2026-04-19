/**
 * Citation engine — a small pandoc-citeproc-lite that runs on the already-
 * rendered markdown HTML, not the source. Scans for `[@key]` tokens (and
 * composite `[@a; @b]` forms), replaces them with inline markup per the
 * chosen citation style, and emits a formatted references list.
 *
 * Scope in v1:
 *   - 4 entry types: book, article, inproceedings, online
 *   - Simple `[@key]` and `[@a; @b]` syntax; no page ranges, no prefixes
 *   - 3 styles: ABNT NBR 6023, IEEE, ACM Reference Format
 *
 * Limitations (known, documented for the user):
 *   - String author parsing is best-effort — particles like "da", "van",
 *     "von", compound surnames, and single-name authors can confuse the
 *     family/given split. Use the object form `{ family, given }` to be
 *     authoritative.
 *   - ABNT has ~40 pages of rules in NBR 6023; we cover the common cases
 *     for the 4 entry types above. Edge cases (ebooks, legal works,
 *     multimedia) fall back to hand-formatted entries in markdown.
 *
 * Entry points: `parseReferences` turns a frontmatter sub-map into a typed
 * map of references; `processCitations` scans the body and returns both
 * the rewritten body and a formatted references section.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type ReferenceType = 'book' | 'article' | 'inproceedings' | 'online' | 'misc';

export interface AuthorName {
	family: string;
	given?: string;
}

export interface Reference {
	key: string;
	type: ReferenceType;
	authors: AuthorName[];
	title: string;
	year?: string;
	// Shared optional
	publisher?: string;
	city?: string;
	pages?: string;
	// Article
	journal?: string;
	volume?: string;
	issue?: string;
	// Inproceedings
	venue?: string;
	// Online
	url?: string;
	accessed?: string;
	// Book
	edition?: string;
	// Misc
	note?: string;
}

/** Normalized inline citation token — [@key] or a composite. */
export interface Citation {
	/** The doc offset where the [...] span started. */
	start: number;
	/** Length of the original `[@…]` markup. */
	length: number;
	/** All keys inside a composite `[@a; @b]`. */
	keys: string[];
}

export interface CitationStyle {
	id: 'abnt' | 'ieee' | 'acm';
	sectionHeading: string;
	/**
	 * How inline citations render. `refs` is the list of resolved references
	 * in a composite; `indices` is their 1-based position in the output
	 * references list (matters for IEEE-style numeric cites). Each
	 * citation returns a clickable fragment per ref so readers can jump
	 * to the matching entry.
	 */
	formatInline(refs: Reference[], indices: number[]): string;
	/** Render one entry in the references list. */
	formatEntry(ref: Reference, index: number): string;
	/** Order used to produce the references list. */
	order: 'appearance' | 'alphabetical';
}

/** Anchor id for the references-list entry — scoped so `#ref-*` is stable. */
export function refId(key: string): string {
	return `ref-${key}`;
}

export interface CitationResult {
	/** Body HTML with `[@key]` tokens replaced by inline markup. */
	body: string;
	/** Pre-formatted references list markup (heading + list), or ''. */
	referencesHtml: string;
	/** True when at least one inline citation was found. */
	hasCitations: boolean;
	/** References in the order they were emitted. */
	emitted: Reference[];
}

// ── Parse frontmatter.references into typed refs ──────────────────────────

function asString(v: unknown): string | undefined {
	return typeof v === 'string' ? v : undefined;
}

function asNumOrStr(v: unknown): string | undefined {
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return String(v);
	return undefined;
}

function parseAuthor(raw: unknown): AuthorName | null {
	if (typeof raw === 'string') return splitNameString(raw);
	if (raw && typeof raw === 'object') {
		const a = raw as Record<string, unknown>;
		const family = asString(a.family);
		const given = asString(a.given);
		if (family) return { family, given };
	}
	return null;
}

/**
 * Best-effort split of a "Firstname Middle Surname" string. Recognizes a
 * few Latin particles that should glue to the surname ("van Rossum", "da
 * Silva"). For anything else, the last whitespace-delimited token is the
 * family name.
 */
function splitNameString(s: string): AuthorName {
	const trimmed = s.trim().replace(/\s+/g, ' ');
	if (!trimmed) return { family: '' };
	// "Surname, Given" form — authoritative.
	const commaIdx = trimmed.indexOf(',');
	if (commaIdx > 0) {
		return {
			family: trimmed.slice(0, commaIdx).trim(),
			given: trimmed.slice(commaIdx + 1).trim() || undefined
		};
	}
	const parts = trimmed.split(' ');
	if (parts.length === 1) return { family: parts[0] };

	const PARTICLES = new Set([
		'van', 'von', 'de', 'da', 'do', 'dos', 'das', 'del', 'della', 'di', 'du', 'la', 'le', 'ten', 'ter'
	]);

	// Walk from the back: the surname is the last word, optionally prefixed
	// by one or two lowercase particles.
	let familyStart = parts.length - 1;
	while (familyStart > 1 && PARTICLES.has(parts[familyStart - 1].toLowerCase())) {
		familyStart -= 1;
	}
	const family = parts.slice(familyStart).join(' ');
	const given = parts.slice(0, familyStart).join(' ');
	return { family, given };
}

/** Parse a frontmatter references map into Reference[] keyed by cite id. */
export function parseReferences(raw: unknown): Record<string, Reference> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: Record<string, Reference> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
		const v = value as Record<string, unknown>;

		const type = normalizeType(asString(v.type));
		const title = asString(v.title);
		if (!title) continue;

		const authorsRaw = Array.isArray(v.authors) ? v.authors : [];
		const authors = authorsRaw
			.map(parseAuthor)
			.filter((a): a is AuthorName => a !== null && !!a.family);

		out[key] = {
			key,
			type,
			authors,
			title,
			year: asNumOrStr(v.year),
			publisher: asString(v.publisher),
			city: asString(v.city),
			pages: asString(v.pages),
			journal: asString(v.journal),
			volume: asNumOrStr(v.volume),
			issue: asNumOrStr(v.issue),
			venue: asString(v.venue),
			url: asString(v.url),
			accessed: asString(v.accessed),
			edition: asNumOrStr(v.edition),
			note: asString(v.note)
		};
	}
	return out;
}

function normalizeType(v: string | undefined): ReferenceType {
	if (v === 'book' || v === 'article' || v === 'inproceedings' || v === 'online') return v;
	return 'misc';
}

// ── Body scanning ────────────────────────────────────────────────────────
// Markdown is already rendered to HTML by the time we see it. The `[@key]`
// tokens survive unchanged (marked doesn't treat them specially). We scan
// the HTML string for them and splice in inline markup; regex-based because
// the inputs are under our control and a DOM parser would balloon the
// dependency surface. Inside `<pre>` or `<code>` blocks we skip — a paper
// that documents citation syntax mustn't have its examples rewritten.

const TOKEN_RE = /\[@([\w:-]+(?:\s*;\s*@[\w:-]+)*)\]/g;

function findCitations(body: string): Citation[] {
	// Precompute the ranges of <pre>...</pre> and <code>...</code> blocks so
	// we can skip hits inside them.
	const protectedRanges: Array<[number, number]> = [];
	const blockRe = /<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/g;
	let bm;
	while ((bm = blockRe.exec(body))) {
		protectedRanges.push([bm.index, bm.index + bm[0].length]);
	}
	const isProtected = (idx: number) =>
		protectedRanges.some(([s, e]) => idx >= s && idx < e);

	const out: Citation[] = [];
	let m;
	while ((m = TOKEN_RE.exec(body))) {
		if (isProtected(m.index)) continue;
		const keys = m[1].split(';').map((k) => k.trim().replace(/^@/, ''));
		out.push({ start: m.index, length: m[0].length, keys });
	}
	return out;
}

// ── Style formatters ─────────────────────────────────────────────────────

function joinAuthors(authors: AuthorName[], style: 'abnt' | 'ieee' | 'acm'): string {
	if (authors.length === 0) return '';

	if (style === 'abnt') {
		// SOBRENOME, Prenome. Multiple authors separated by "; ". Up to 3
		// authors are listed; 4+ uses "SURNAME et al."
		if (authors.length > 3) {
			return `${authors[0].family.toUpperCase()}, ${initials(authors[0].given)} et al.`;
		}
		return authors
			.map((a) => `${a.family.toUpperCase()}, ${a.given ? a.given : ''}`.replace(/,\s*$/, ''))
			.join('; ');
	}

	if (style === 'ieee') {
		// A. Surname, B. Other. 6+ authors collapse to "A. Surname et al."
		const fmt = (a: AuthorName) => `${initials(a.given)} ${a.family}`.trim();
		if (authors.length >= 6) return `${fmt(authors[0])} et al.`;
		if (authors.length === 1) return fmt(authors[0]);
		if (authors.length === 2) return `${fmt(authors[0])} and ${fmt(authors[1])}`;
		return `${authors.slice(0, -1).map(fmt).join(', ')}, and ${fmt(authors.at(-1)!)}`;
	}

	// ACM — Firstname Surname, Firstname Surname, and Firstname Surname.
	const fmt = (a: AuthorName) => `${a.given ?? ''} ${a.family}`.trim();
	if (authors.length === 1) return fmt(authors[0]);
	if (authors.length === 2) return `${fmt(authors[0])} and ${fmt(authors[1])}`;
	return `${authors.slice(0, -1).map(fmt).join(', ')}, and ${fmt(authors.at(-1)!)}`;
}

function initials(given: string | undefined): string {
	if (!given) return '';
	return given
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => (w.length > 0 ? `${w[0].toUpperCase()}.` : ''))
		.join(' ');
}

function inlineAuthorYear(ref: Reference, style: 'abnt' | 'acm'): string {
	if (ref.authors.length === 0) return `${ref.title}${ref.year ? `, ${ref.year}` : ''}`;
	const first = ref.authors[0];

	if (style === 'abnt') {
		const name = first.family.toUpperCase();
		if (ref.authors.length >= 3) return `${name} et al.${ref.year ? `, ${ref.year}` : ''}`;
		if (ref.authors.length === 2) {
			return `${name}; ${ref.authors[1].family.toUpperCase()}${ref.year ? `, ${ref.year}` : ''}`;
		}
		return `${name}${ref.year ? `, ${ref.year}` : ''}`;
	}

	// ACM — "Firstname Surname. Year." inline with brackets.
	const name = `${first.given ? first.given[0] + '.' : ''} ${first.family}`.trim();
	if (ref.authors.length >= 3) return `${name} et al. ${ref.year ?? ''}`.trim();
	if (ref.authors.length === 2) {
		const second = ref.authors[1];
		const n2 = `${second.given ? second.given[0] + '.' : ''} ${second.family}`.trim();
		return `${name} and ${n2} ${ref.year ?? ''}`.trim();
	}
	return `${name} ${ref.year ?? ''}`.trim();
}

// ── ABNT (NBR 6023) ──────────────────────────────────────────────────────

export const abntStyle: CitationStyle = {
	id: 'abnt',
	sectionHeading: 'Referências',
	order: 'alphabetical',
	formatInline(refs) {
		// Composite cites: "(AUTOR1, 2020; AUTOR2, 2021)". Each chunk is
		// its own anchor so clicking jumps to the exact entry.
		const parts = refs.map(
			(r) => `<a class="cite-link" href="#${refId(r.key)}">${inlineAuthorYear(r, 'abnt')}</a>`
		);
		return `<span class="cite cite-abnt">(${parts.join('; ')})</span>`;
	},
	formatEntry(ref) {
		const parts: string[] = [];
		const authors = joinAuthors(ref.authors, 'abnt');
		if (authors) parts.push(`${authors}.`);
		parts.push(`<strong>${ref.title}</strong>.`);

		if (ref.type === 'book') {
			const place = [ref.city, ref.publisher].filter(Boolean).join(': ');
			if (ref.edition) parts.push(`${ref.edition}. ed.`);
			if (place) parts.push(`${place},`);
			if (ref.year) parts.push(`${ref.year}.`);
		} else if (ref.type === 'article') {
			if (ref.journal) parts.push(`<em>${ref.journal}</em>,`);
			if (ref.city) parts.push(`${ref.city},`);
			if (ref.volume) parts.push(`v. ${ref.volume},`);
			if (ref.issue) parts.push(`n. ${ref.issue},`);
			if (ref.pages) parts.push(`p. ${ref.pages},`);
			if (ref.year) parts.push(`${ref.year}.`);
		} else if (ref.type === 'inproceedings') {
			if (ref.venue) parts.push(`In: <em>${ref.venue}</em>,`);
			if (ref.year) parts.push(`${ref.year}.`);
			if (ref.city) parts.push(`Anais... ${ref.city}:`);
			if (ref.publisher) parts.push(`${ref.publisher},`);
			if (ref.pages) parts.push(`p. ${ref.pages}.`);
		} else if (ref.type === 'online') {
			if (ref.year) parts.push(`${ref.year}.`);
			if (ref.url) parts.push(`Disponível em: ${ref.url}.`);
			if (ref.accessed) parts.push(`Acesso em: ${ref.accessed}.`);
		} else {
			if (ref.year) parts.push(`${ref.year}.`);
			if (ref.note) parts.push(ref.note);
		}

		return parts.join(' ').replace(/\s+\./g, '.').replace(/,\s*\./g, '.');
	}
};

// ── IEEE ─────────────────────────────────────────────────────────────────

export const ieeeStyle: CitationStyle = {
	id: 'ieee',
	sectionHeading: 'References',
	order: 'appearance',
	formatInline(refs, indices) {
		// Composite cites: "[1], [2]" with each number linked to its entry.
		const parts = refs.map(
			(r, i) => `<a class="cite-link" href="#${refId(r.key)}">${indices[i]}</a>`
		);
		return `<span class="cite cite-ieee">[${parts.join('], [')}]</span>`;
	},
	formatEntry(ref, index) {
		const parts: string[] = [];
		const authors = joinAuthors(ref.authors, 'ieee');
		parts.push(`[${index}]`);
		if (authors) parts.push(`${authors},`);

		if (ref.type === 'book') {
			parts.push(`<em>${ref.title}</em>,`);
			if (ref.edition) parts.push(`${ref.edition} ed.`);
			if (ref.city) parts.push(`${ref.city}:`);
			if (ref.publisher) parts.push(`${ref.publisher},`);
			if (ref.year) parts.push(`${ref.year}.`);
		} else if (ref.type === 'article') {
			parts.push(`"${ref.title},"`);
			if (ref.journal) parts.push(`<em>${ref.journal}</em>,`);
			if (ref.volume) parts.push(`vol. ${ref.volume},`);
			if (ref.issue) parts.push(`no. ${ref.issue},`);
			if (ref.pages) parts.push(`pp. ${ref.pages},`);
			if (ref.year) parts.push(`${ref.year}.`);
		} else if (ref.type === 'inproceedings') {
			parts.push(`"${ref.title},"`);
			if (ref.venue) parts.push(`in <em>${ref.venue}</em>,`);
			if (ref.city) parts.push(`${ref.city},`);
			if (ref.year) parts.push(`${ref.year},`);
			if (ref.pages) parts.push(`pp. ${ref.pages}.`);
		} else if (ref.type === 'online') {
			parts.push(`"${ref.title},"`);
			if (ref.year) parts.push(`${ref.year}.`);
			parts.push('[Online].');
			if (ref.url) parts.push(`Available: ${ref.url}`);
		} else {
			parts.push(`<em>${ref.title}</em>.`);
			if (ref.year) parts.push(`${ref.year}.`);
		}

		return parts.join(' ').replace(/\s+\./g, '.').replace(/,\s*\./g, '.');
	}
};

// ── ACM Reference Format (author-year variant) ──────────────────────────

export const acmStyle: CitationStyle = {
	id: 'acm',
	sectionHeading: 'References',
	order: 'alphabetical',
	formatInline(refs) {
		const parts = refs.map(
			(r) => `<a class="cite-link" href="#${refId(r.key)}">${inlineAuthorYear(r, 'acm')}</a>`
		);
		return `<span class="cite cite-acm">[${parts.join('; ')}]</span>`;
	},
	formatEntry(ref) {
		const parts: string[] = [];
		const authors = joinAuthors(ref.authors, 'acm');
		if (authors) parts.push(`${authors}.`);
		if (ref.year) parts.push(`${ref.year}.`);

		if (ref.type === 'book') {
			parts.push(`<em>${ref.title}</em>.`);
			if (ref.edition) parts.push(`${ref.edition} ed.`);
			if (ref.publisher) parts.push(`${ref.publisher}${ref.city ? `, ${ref.city}` : ''}.`);
		} else if (ref.type === 'article') {
			parts.push(`${ref.title}.`);
			if (ref.journal) parts.push(`<em>${ref.journal}</em>`);
			if (ref.volume) parts.push(`${ref.volume}${ref.issue ? `(${ref.issue})` : ''}`);
			if (ref.pages) parts.push(`${ref.pages}.`);
		} else if (ref.type === 'inproceedings') {
			parts.push(`${ref.title}.`);
			if (ref.venue) parts.push(`In <em>${ref.venue}</em>.`);
			if (ref.pages) parts.push(`${ref.pages}.`);
		} else if (ref.type === 'online') {
			parts.push(`${ref.title}.`);
			if (ref.url) parts.push(`Retrieved from ${ref.url}`);
			if (ref.accessed) parts.push(`(accessed ${ref.accessed}).`);
		} else {
			parts.push(`<em>${ref.title}</em>.`);
			if (ref.note) parts.push(ref.note);
		}

		return parts.join(' ').replace(/\s+\./g, '.').replace(/,\s*\./g, '.');
	}
};

// ── The main pass ────────────────────────────────────────────────────────

/**
 * Scan body for `[@key]` tokens, replace them with inline markup per style,
 * and return a references block listing every cited work. Unknown keys are
 * left in place as "[?@key]" so the author notices and can fix them rather
 * than silently losing citations.
 */
export function processCitations(
	bodyHtml: string,
	references: Record<string, Reference>,
	style: CitationStyle
): CitationResult {
	const citations = findCitations(bodyHtml);
	if (citations.length === 0) {
		return { body: bodyHtml, referencesHtml: '', hasCitations: false, emitted: [] };
	}

	// Assign numbers in appearance order. Even for alphabetical styles this
	// tracks "which keys were actually cited" — uncited refs never appear.
	const appearanceKeys: string[] = [];
	const seen = new Set<string>();
	for (const c of citations) {
		for (const k of c.keys) {
			if (!seen.has(k)) {
				seen.add(k);
				appearanceKeys.push(k);
			}
		}
	}

	// Resolve the final emission order.
	const citedRefs = appearanceKeys
		.map((k) => references[k])
		.filter((r): r is Reference => !!r);

	const emitted = style.order === 'alphabetical'
		? [...citedRefs].sort((a, b) =>
			(a.authors[0]?.family ?? a.title).localeCompare(b.authors[0]?.family ?? b.title, 'pt-BR')
		)
		: citedRefs;

	// 1-based index map from key → position in the emitted list.
	const indexMap = new Map<string, number>();
	emitted.forEach((r, i) => indexMap.set(r.key, i + 1));

	// Splice inline markup back-to-front so earlier offsets stay valid.
	const sorted = [...citations].sort((a, b) => b.start - a.start);
	let body = bodyHtml;
	for (const c of sorted) {
		const resolved = c.keys.map((k) => references[k]);
		const anyMissing = resolved.some((r) => !r);
		if (anyMissing) {
			const replacement = `<span class="cite cite-missing">[?${c.keys.map((k) => `@${k}`).join('; ')}]</span>`;
			body = body.slice(0, c.start) + replacement + body.slice(c.start + c.length);
			continue;
		}
		const indices = c.keys.map((k) => indexMap.get(k) ?? 0);
		const replacement = style.formatInline(resolved as Reference[], indices);
		body = body.slice(0, c.start) + replacement + body.slice(c.start + c.length);
	}

	const listTag = style.order === 'appearance' ? 'ol' : 'ul';
	const entries = emitted
		.map((r, i) => `<li id="${refId(r.key)}" class="reference-entry">${style.formatEntry(r, i + 1)}</li>`)
		.join('\n');

	const referencesHtml = emitted.length > 0
		? `<section class="references-section">
<h2 class="references-heading">${style.sectionHeading}</h2>
<${listTag} class="references-list">
${entries}
</${listTag}>
</section>`
		: '';

	return {
		body,
		referencesHtml,
		hasCitations: true,
		emitted
	};
}

/**
 * Strip any author-written `## References` / `## Referências` block from the
 * end of the body so the auto-generated one doesn't duplicate with it. If
 * the author wrote entries under that heading they're discarded — authors
 * using `[@key]` opt into full auto-generation; mixed modes are out of
 * scope.
 */
export function stripReferencesHeading(bodyHtml: string): string {
	return bodyHtml.replace(
		/<h[12][^>]*id="(references|referencias|refer[eê]ncias|bibliography|bibliografia)"[^>]*>[\s\S]*$/i,
		''
	);
}

// ── Web-viewer helpers ──────────────────────────────────────────────────
// The viewer route reuses the same engine as the PDF templates. These
// exports let it pick a style by template id and surface a short-form
// label for the right-rail "Obras citadas" list.

const STYLE_BY_TEMPLATE: Record<string, CitationStyle> = {
	abnt: abntStyle,
	acm: acmStyle,
	ieee: ieeeStyle
};

/** Resolve a template id to its citation style, or null if not academic. */
export function getStyleForTemplate(id: string): CitationStyle | null {
	return STYLE_BY_TEMPLATE[id] ?? null;
}

/** Short-form "Author, year" label for the sidebar. Plain text, no markup. */
export function shortLabel(ref: Reference): string {
	const first = ref.authors[0];
	const name = first
		? (ref.authors.length >= 3
			? `${first.family} et al.`
			: ref.authors.length === 2
				? `${first.family} & ${ref.authors[1].family}`
				: first.family)
		: '—';
	return ref.year ? `${name}, ${ref.year}` : name;
}
