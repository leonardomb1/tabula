/**
 * Import-graph extraction for repo mirrors: regex-level, resolution against the
 * set of files actually in the repo. Good enough to navigate by — full
 * language-server resolution is a non-goal.
 */

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.vue'];
const JS_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue)$/;
const PY_FILE = /\.py$/;

const JS_IMPORT_RE =
	/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const PY_FROM_RE = /^\s*from\s+([.\w]+)\s+import\s/gm;
const PY_IMPORT_RE = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;

/** Normalize `a/b/../c` and `./x` segments without touching the filesystem. */
function normalizePath(p: string): string {
	const out: string[] = [];
	for (const seg of p.split('/')) {
		if (seg === '' || seg === '.') continue;
		if (seg === '..') out.pop();
		else out.push(seg);
	}
	return out.join('/');
}

function dirname(path: string): string {
	const i = path.lastIndexOf('/');
	return i < 0 ? '' : path.slice(0, i);
}

function resolveJs(fromFile: string, spec: string, files: Set<string>): string | null {
	if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
	const base = spec.startsWith('/')
		? normalizePath(spec)
		: normalizePath(`${dirname(fromFile)}/${spec}`);
	if (files.has(base)) return base;
	for (const ext of JS_EXTS) if (files.has(base + ext)) return base + ext;
	for (const ext of JS_EXTS) if (files.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
	return null;
}

function resolvePyModule(module: string, fromFile: string, files: Set<string>): string | null {
	let base: string;
	if (module.startsWith('.')) {
		const ups = module.match(/^\.+/)![0].length;
		let dir = dirname(fromFile);
		for (let i = 1; i < ups; i++) dir = dirname(dir);
		const rest = module.slice(ups).replace(/\./g, '/');
		base = normalizePath(rest ? `${dir}/${rest}` : dir);
	} else {
		base = module.replace(/\./g, '/');
	}
	if (files.has(`${base}.py`)) return `${base}.py`;
	if (files.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
	return null;
}

/** Repo-internal files that `path`'s content imports, resolved and deduplicated. */
export function extractImports(path: string, content: string, files: Set<string>): string[] {
	const targets = new Set<string>();

	if (JS_FILE.test(path)) {
		for (const m of content.matchAll(JS_IMPORT_RE)) {
			const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
			if (!spec) continue;
			const hit = resolveJs(path, spec, files);
			if (hit && hit !== path) targets.add(hit);
		}
	} else if (PY_FILE.test(path)) {
		for (const m of content.matchAll(PY_FROM_RE)) {
			const hit = resolvePyModule(m[1], path, files);
			if (hit && hit !== path) targets.add(hit);
		}
		for (const m of content.matchAll(PY_IMPORT_RE)) {
			for (const mod of m[1].split(',')) {
				const hit = resolvePyModule(mod.trim(), path, files);
				if (hit && hit !== path) targets.add(hit);
			}
		}
	}

	return [...targets];
}
