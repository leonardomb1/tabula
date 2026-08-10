/**
 * Turning typst's compiler output into something a caller can act on.
 *
 * What the compiler actually gives us, measured against
 * @myriaddreamin/typst-ts-node-compiler 0.7.0:
 *
 * - `message` is good: "unknown variable: undefined_thing", "expected length,
 *   found string", "package not found (searched for @preview/x:0.1.0)".
 * - `path` is meaningful and distinguishes files, which is the single most
 *   useful signal available: it says whether the fault is in the TEMPLATE or in
 *   the DOCUMENT body, and those have different fixes.
 * - `range` is ALWAYS null — there are no line or column numbers, with
 *   `mainFileContent` or a real `mainFilePath` alike. `fetchDiagnostics()`
 *   returns exactly what `shortDiagnostics` does, despite what its doc comment
 *   promises, so there is no richer source to reach for.
 * - Only the FIRST error is reported. Three unknown variables produce one
 *   diagnostic, not three. Fixing one reveals the next.
 *
 * The missing line numbers are why `locate()` exists below: when a message names
 * an identifier we can find that token in the source ourselves and hand back real
 * line numbers. It is a search, not compiler truth, so it is reported as
 * "candidates" and never as the definitive position.
 */

/** Observed: 1 on every error, 4 on the trace entry that follows an import. */
const SEVERITY: Record<number, 'error' | 'warning' | 'note'> = {
	1: 'error',
	2: 'warning'
};

export interface TypstDiagnostic {
	severity: 'error' | 'warning' | 'note';
	/** Raw code, kept because the mapping above is only partly observed. */
	severityCode: number;
	message: string;
	/** 'template', 'document', or a workspace-relative path. */
	file: string;
}

export interface CompileSources {
	/** The typst wrapper: a stored workspace template, or templateSource. */
	template?: string;
	/** The markdown body, shadow-mapped into the compile as /doc.md. */
	document?: string;
}

export interface DiagnosticHit {
	file: 'template' | 'document';
	line: number;
	text: string;
}

/**
 * Which input a diagnostic belongs to. The wrapper is compiled as
 * `mainFileContent`, which the compiler names `__main__.typ`; the markdown body
 * is shadow-mapped to `/doc.md` (see markdown/pdf.ts).
 */
function labelFor(rawPath: string, root: string): string {
	const rel = rawPath.startsWith(root) ? rawPath.slice(root.length).replace(/^\/+/, '') : rawPath;
	if (rel === '__main__.typ') return 'template';
	if (rel === 'doc.md') return 'document';
	return rel || rawPath;
}

export function normalizeDiagnostics(raw: unknown[], root: string): TypstDiagnostic[] {
	return raw.map((entry) => {
		const d = (entry ?? {}) as {
			message?: unknown;
			path?: unknown;
			severity?: unknown;
			package?: unknown;
		};
		const code = typeof d.severity === 'number' ? d.severity : 0;
		const pkg = typeof d.package === 'string' && d.package ? d.package : '';
		return {
			severity: SEVERITY[code] ?? 'note',
			severityCode: code,
			message: typeof d.message === 'string' ? d.message : 'compilation failed',
			file: pkg || labelFor(typeof d.path === 'string' ? d.path : '', root)
		};
	});
}

/** A one-line summary for Error.message, which the editor preview shows users. */
export function summarize(diags: TypstDiagnostic[]): string {
	const first = diags.find((d) => d.severity === 'error') ?? diags[0];
	if (!first) return 'typst: compilation failed';
	const where = first.file ? ` in ${first.file}` : '';
	return `typst: ${first.message}${where}`;
}

/**
 * Identifiers worth searching for. Typst names the offending symbol in most
 * messages, and that name is usually unique enough in a document to pin the line.
 */
const TOKEN_PATTERNS = [
	/unknown variable: (\S+)/,
	/unknown field: (\S+)/,
	/unexpected argument: (\S+)/,
	/undefined function: (\S+)/,
	/searched for (\S+)/,
	/searched at (\S+)/
];

function tokensIn(message: string): string[] {
	const found = new Set<string>();
	for (const pattern of TOKEN_PATTERNS) {
		const hit = message.match(pattern);
		if (hit?.[1]) found.add(hit[1].replace(/[),.]+$/, ''));
	}
	for (const quoted of message.matchAll(/`([^`]+)`/g)) found.add(quoted[1]);
	return [...found].filter((t) => t.length > 1);
}

const MAX_HITS = 5;

/** Lines in `source` containing any token named by the message. */
function locate(message: string, source: string, file: 'template' | 'document'): DiagnosticHit[] {
	const tokens = tokensIn(message);
	if (tokens.length === 0) return [];
	const hits: DiagnosticHit[] = [];
	const lines = source.split('\n');
	for (let i = 0; i < lines.length && hits.length < MAX_HITS; i++) {
		if (tokens.some((t) => lines[i].includes(t))) {
			hits.push({ file, line: i + 1, text: lines[i].trim().slice(0, 160) });
		}
	}
	return hits;
}

export interface CompileFailureReport {
	error: 'compile_failed';
	message: string;
	diagnostics: TypstDiagnostic[];
	/** Best-effort line numbers; a text search, not compiler output. */
	candidateLines: DiagnosticHit[];
	note: string;
	nextStep: string;
}

/**
 * The payload a failed compile returns to an MCP caller. Deliberately tells the
 * caller what to DO: an agent that gets only "compilation failed" reports defeat
 * to the user, when the fix is nearly always one small edit away.
 */
export function explainCompileError(
	message: string,
	diagnostics: TypstDiagnostic[],
	sources: CompileSources,
	/**
	 * Overrides the derived instruction. Needed when the compile had only one
	 * input: a stored document compiles as `__main__.typ`, so the diagnostic says
	 * "template" when the thing to fix is actually the document.
	 */
	opts: { nextStep?: string } = {}
): CompileFailureReport {
	// Search EVERY source, not just the one the compiler named. A ```typst block in
	// the markdown body is evaluated by cmarker, so its errors are reported against
	// the package — following that path would send the caller to fix a dependency
	// when the fault is in the document. Where the identifier actually appears is
	// the more reliable signal.
	const candidateLines: DiagnosticHit[] = [];
	for (const d of diagnostics) {
		if (sources.template) candidateLines.push(...locate(d.message, sources.template, 'template'));
		if (sources.document) candidateLines.push(...locate(d.message, sources.document, 'document'));
	}

	const reported = diagnostics.find((d) => d.severity === 'error')?.file;
	// Trust the compiler when it names one of our own inputs; otherwise fall back to
	// wherever the identifier turned up.
	const blame =
		reported === 'template' || reported === 'document' ? reported : candidateLines[0]?.file;
	const viaPackage = !!reported && reported !== 'template' && reported !== 'document';
	const nextStep =
		opts.nextStep ??
		(blame === 'document'
			? 'The fault is in the document body, not the template. Fix it with patch_doc, then check_doc, then render again.'
			: blame === 'template'
				? 'The fault is in the typst template you supplied. Correct templateSource and call this tool again — do not resend the document body.'
				: 'Fix the reported input and call this tool again.');

	const packageNote = viaPackage
		? ` The error surfaced inside ${reported}, which usually means a \`\`\`typst block in the document body — that package is not itself broken, so fix the typst you wrote rather than the dependency.`
		: '';

	return {
		error: 'compile_failed',
		message,
		diagnostics,
		candidateLines,
		note:
			'typst reports only the FIRST error, and gives no line numbers — candidateLines is a text search for the names in the message, so treat it as a hint. Expect another error after fixing this one; that is normal, keep going.' +
			packageNote,
		nextStep: `${nextStep} Retry rather than reporting failure: a compile error is a step in the loop, not a dead end.`
	};
}
