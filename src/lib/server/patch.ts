/**
 * Applying small edits to a document source, so revising a document costs the
 * diff instead of the whole text.
 *
 * Two edit forms, and a call must use one or the other:
 *
 * - **anchored**: `{ oldText, newText }` — exact substring replacement. Must match
 *   exactly once unless `replaceAll` is set. Self-verifying (a stale anchor simply
 *   fails), so it is the safe default.
 * - **line range**: `{ startLine, endLine, newText }` — 1-indexed, inclusive.
 *   Cheaper for replacing a large block, because the caller doesn't have to
 *   re-send the text being replaced.
 *
 * Mixing the two in one call is refused rather than resolved. Line numbers would
 * have to mean "before the anchored edits" or "after" them, and either choice is
 * a trap for the caller; sending two calls is unambiguous.
 *
 * Failures come back as diagnostics naming the offending edit, never as a partial
 * application: an edit list either lands whole or changes nothing.
 */

export interface AnchoredEdit {
	oldText: string;
	newText: string;
	replaceAll?: boolean;
}

export interface LineEdit {
	startLine: number;
	endLine: number;
	newText: string;
}

export type Edit = AnchoredEdit | LineEdit;

export interface PatchDiagnostic {
	/** Index in the submitted edits array, 0-based. -1 for whole-call problems. */
	edit: number;
	reason: 'not_found' | 'ambiguous' | 'out_of_range' | 'overlap' | 'mixed_forms' | 'empty';
	message: string;
}

export type PatchResult =
	| { ok: true; source: string; applied: number }
	| { ok: false; diagnostics: PatchDiagnostic[] };

function isLineEdit(edit: Edit): edit is LineEdit {
	return typeof (edit as LineEdit).startLine === 'number';
}

function countOccurrences(haystack: string, needle: string): number {
	let count = 0;
	let at = haystack.indexOf(needle);
	while (at !== -1) {
		count++;
		at = haystack.indexOf(needle, at + needle.length);
	}
	return count;
}

/** A short, unambiguous echo of an anchor in an error message. */
function excerpt(text: string, max = 60): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function applyAnchored(source: string, edits: AnchoredEdit[]): PatchResult {
	const diagnostics: PatchDiagnostic[] = [];
	let next = source;

	edits.forEach((edit, i) => {
		if (edit.oldText === '') {
			diagnostics.push({ edit: i, reason: 'empty', message: 'oldText is empty' });
			return;
		}
		const hits = countOccurrences(next, edit.oldText);
		if (hits === 0) {
			diagnostics.push({
				edit: i,
				reason: 'not_found',
				message: `oldText not found: "${excerpt(edit.oldText)}" — re-read the document, it may have changed or the whitespace may differ`
			});
			return;
		}
		if (hits > 1 && !edit.replaceAll) {
			diagnostics.push({
				edit: i,
				reason: 'ambiguous',
				message: `oldText matches ${hits} places: "${excerpt(edit.oldText)}" — include more surrounding text, or set replaceAll`
			});
			return;
		}
		next = edit.replaceAll
			? next.split(edit.oldText).join(edit.newText)
			: next.replace(edit.oldText, edit.newText);
	});

	if (diagnostics.length > 0) return { ok: false, diagnostics };
	return { ok: true, source: next, applied: edits.length };
}

function applyLines(source: string, edits: LineEdit[]): PatchResult {
	const lines = source.split('\n');
	const diagnostics: PatchDiagnostic[] = [];

	edits.forEach((edit, i) => {
		if (
			!Number.isInteger(edit.startLine) ||
			!Number.isInteger(edit.endLine) ||
			edit.startLine < 1 ||
			edit.endLine < edit.startLine ||
			edit.endLine > lines.length
		) {
			diagnostics.push({
				edit: i,
				reason: 'out_of_range',
				message: `lines ${edit.startLine}-${edit.endLine} are outside the document (1-${lines.length})`
			});
		}
	});
	if (diagnostics.length > 0) return { ok: false, diagnostics };

	// Overlap has to be refused: two edits covering the same line have no defined
	// combined result, and silently letting the later one win loses the earlier.
	const ordered = edits
		.map((edit, i) => ({ edit, i }))
		.sort((a, b) => a.edit.startLine - b.edit.startLine);
	for (let n = 1; n < ordered.length; n++) {
		const prev = ordered[n - 1];
		const cur = ordered[n];
		if (cur.edit.startLine <= prev.edit.endLine) {
			diagnostics.push({
				edit: cur.i,
				reason: 'overlap',
				message: `lines ${cur.edit.startLine}-${cur.edit.endLine} overlap edit ${prev.i} (lines ${prev.edit.startLine}-${prev.edit.endLine})`
			});
		}
	}
	if (diagnostics.length > 0) return { ok: false, diagnostics };

	// Bottom-up, so each splice leaves the line numbers of the edits above it
	// still valid against the original document.
	const next = [...lines];
	for (const { edit } of [...ordered].reverse()) {
		const replacement = edit.newText === '' ? [] : edit.newText.split('\n');
		next.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, ...replacement);
	}

	return { ok: true, source: next.join('\n'), applied: edits.length };
}

export function applyEdits(source: string, edits: Edit[]): PatchResult {
	if (edits.length === 0) {
		return { ok: false, diagnostics: [{ edit: -1, reason: 'empty', message: 'no edits given' }] };
	}

	const lineEdits = edits.filter(isLineEdit);
	if (lineEdits.length > 0 && lineEdits.length < edits.length) {
		return {
			ok: false,
			diagnostics: [
				{
					edit: -1,
					reason: 'mixed_forms',
					message:
						'one call cannot mix anchored ({oldText}) and line-range ({startLine}) edits — send them as separate calls'
				}
			]
		};
	}

	return lineEdits.length > 0
		? applyLines(source, lineEdits)
		: applyAnchored(source, edits as AnchoredEdit[]);
}

/**
 * The document with 1-indexed line-number prefixes — what a caller reads to
 * recover from a failed patch, and what line-range edits are numbered against.
 */
export function withLineNumbers(source: string, from = 1, to?: number): string {
	const lines = source.split('\n');
	const start = Math.max(1, from);
	const end = Math.min(to ?? lines.length, lines.length);
	const width = String(end).length;
	const out: string[] = [];
	for (let n = start; n <= end; n++) {
		out.push(`${String(n).padStart(width, ' ')}\t${lines[n - 1]}`);
	}
	return out.join('\n');
}

export function lineCount(source: string): number {
	return source.split('\n').length;
}
