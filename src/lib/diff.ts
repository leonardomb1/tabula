/**
 * Line-level diff built on a classic LCS (longest common subsequence)
 * backtrack. Used by the AI dock's edit-review card to show what the
 * agent wants to change before the user accepts.
 *
 * Shape is intentionally minimal — just `same | add | del` lines — and
 * downstream collapsing into hunks (with context) is a separate pass so
 * callers can render "full diff" or "collapsed" as they need.
 *
 * Complexity is O(m × n) in memory and time. Fine for doc-sized inputs;
 * we defensively cap at MAX_LINES per side and fall back to a whole-
 * document replace on anything larger (rare, and the fallback is still
 * reviewable — just less granular).
 */

export type DiffLine =
	| { kind: 'same'; text: string }
	| { kind: 'add'; text: string }
	| { kind: 'del'; text: string };

export type Hunk =
	| { kind: 'lines'; lines: DiffLine[] }
	| { kind: 'gap'; count: number };

const MAX_LINES = 4000;

export function lineDiff(oldText: string, newText: string): DiffLine[] {
	const a = oldText.split('\n');
	const b = newText.split('\n');

	if (a.length > MAX_LINES || b.length > MAX_LINES) {
		// Too big for a full LCS — show as a single replace so the user
		// still sees both sides and can accept/reject knowingly.
		return [
			...a.map((text) => ({ kind: 'del' as const, text })),
			...b.map((text) => ({ kind: 'add' as const, text }))
		];
	}

	const m = a.length;
	const n = b.length;
	// dp[i][j] = LCS length of a[i..] and b[j..]. Using flat Int32Array
	// rows keeps memory tight on larger docs (one allocation per row).
	const dp: Int32Array[] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
	for (let i = m - 1; i >= 0; i--) {
		for (let j = n - 1; j >= 0; j--) {
			if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
			else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}

	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < m && j < n) {
		if (a[i] === b[j]) {
			out.push({ kind: 'same', text: a[i] });
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			out.push({ kind: 'del', text: a[i] });
			i++;
		} else {
			out.push({ kind: 'add', text: b[j] });
			j++;
		}
	}
	while (i < m) {
		out.push({ kind: 'del', text: a[i] });
		i++;
	}
	while (j < n) {
		out.push({ kind: 'add', text: b[j] });
		j++;
	}
	return out;
}

/**
 * Collapse unchanged runs longer than `context * 2` lines into a gap
 * marker so long docs with a few local edits render as compact hunks
 * instead of a wall of identical lines. The first and last `context`
 * lines around each change are kept.
 */
export function collapseToHunks(lines: DiffLine[], context = 3): Hunk[] {
	const out: Hunk[] = [];
	// Index every change (add/del) so we know where context windows go.
	const changeIdx: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].kind !== 'same') changeIdx.push(i);
	}
	if (changeIdx.length === 0) {
		return lines.length > 0 ? [{ kind: 'gap', count: lines.length }] : [];
	}

	// Mark every line that should be visible (a change, or within context).
	const keep = new Array<boolean>(lines.length).fill(false);
	for (const idx of changeIdx) {
		const lo = Math.max(0, idx - context);
		const hi = Math.min(lines.length - 1, idx + context);
		for (let k = lo; k <= hi; k++) keep[k] = true;
	}

	// Emit runs: either a visible hunk (one or more kept lines) or a gap.
	let k = 0;
	while (k < lines.length) {
		if (keep[k]) {
			const start = k;
			while (k < lines.length && keep[k]) k++;
			out.push({ kind: 'lines', lines: lines.slice(start, k) });
		} else {
			const start = k;
			while (k < lines.length && !keep[k]) k++;
			out.push({ kind: 'gap', count: k - start });
		}
	}
	return out;
}

/** Compact count of additions + deletions for badge rendering. */
export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const l of lines) {
		if (l.kind === 'add') added++;
		else if (l.kind === 'del') removed++;
	}
	return { added, removed };
}
