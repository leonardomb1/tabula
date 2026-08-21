/**
 * Markdown-aware chunking for the semantic index, shared verbatim in spirit
 * with PerguntAI's document store so a document retrieves the same way on
 * either side. Sections split along headings and each chunk is prefixed with
 * its heading trail, so a fragment still names the chapter it came from when
 * it surfaces alone. Plain text falls back to size-based splitting.
 */

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;

/** Size-based splitting, breaking on a paragraph or sentence boundary when near. */
function splitBySize(clean: string): string[] {
	if (!clean) return [];
	const chunks: string[] = [];
	let start = 0;
	while (start < clean.length) {
		let end = Math.min(start + CHUNK_SIZE, clean.length);
		if (end < clean.length) {
			const slice = clean.slice(start, end);
			const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
			if (breakAt > CHUNK_SIZE * 0.5) end = start + breakAt + 1;
		}
		chunks.push(clean.slice(start, end).trim());
		if (end >= clean.length) break;
		start = end - CHUNK_OVERLAP;
	}
	return chunks.filter((c) => c.length > 0);
}

interface MdSection {
	/** Heading trail down to this section, e.g. ['Compras', 'Aprovação']. */
	path: string[];
	body: string;
}

/**
 * Split markdown into sections at ATX headings, keeping the heading trail.
 * Fenced code blocks are opaque — a `#` inside ``` is not a heading.
 */
function markdownSections(clean: string): MdSection[] {
	const sections: MdSection[] = [];
	const path: { level: number; title: string; hasBody: boolean }[] = [];
	let body: string[] = [];
	let inFence = false;

	const push = () => {
		const text = body.join('\n').trim();
		if (text) {
			sections.push({ path: path.map((h) => h.title), body: text });
			// The text belongs to every ancestor, so all of them now "have body".
			for (const h of path) h.hasBody = true;
		}
		body = [];
	};

	for (const line of clean.split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
		const heading = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			push();
			const level = heading[1].length;
			// A same-level sibling replaces the top of the path — unless that top
			// never got any body text: consecutive headings ('# Doc 05' directly
			// over '# Fonte: …') act as one stacked title, so the second nests
			// under the first instead of erasing it from every chunk's trail.
			while (path.length) {
				const top = path[path.length - 1];
				if (top.level > level || (top.level === level && top.hasBody)) path.pop();
				else break;
			}
			path.push({ level, title: heading[2].trim(), hasBody: false });
		} else {
			body.push(line);
		}
	}
	push();
	return sections;
}

/**
 * Chunk a document for retrieval. Markdown with real structure is split along
 * its headings, each chunk prefixed with the heading trail — so "item 4.2.1"
 * still knows which chapter it belongs to when it surfaces alone; a tiny
 * section rides with its heading rather than becoming a fragment. Anything
 * else falls back to plain size-based splitting.
 */
export function chunkText(text: string): string[] {
	const clean = text.replace(/\r\n/g, '\n').trim();
	if (!clean) return [];

	const sections = markdownSections(clean);
	// Structure has to be real to be useful: a lone '# Title' is not a book.
	if (sections.filter((sec) => sec.path.length > 0).length < 2) {
		return splitBySize(clean);
	}

	const chunks: string[] = [];
	for (const section of sections) {
		const trail = section.path.length ? `[${section.path.join(' > ')}]\n` : '';
		for (const piece of splitBySize(section.body)) {
			chunks.push(`${trail}${piece}`);
		}
	}
	return chunks;
}

