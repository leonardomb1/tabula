import { expect, test } from 'bun:test';
import { extractImports } from './imports';

const files = new Set([
	'src/lib/nav.ts',
	'src/lib/db/index.ts',
	'src/routes/page.svelte',
	'src/util.js',
	'app/main.py',
	'app/services/db.py',
	'app/services/__init__.py'
]);

test('resolves relative ts imports with extension and index guessing', () => {
	const out = extractImports(
		'src/routes/page.svelte',
		`import { docHref } from '../lib/nav';\nimport db from '../lib/db';\nimport ext from 'svelte';`,
		files
	);
	expect(out.sort()).toEqual(['src/lib/db/index.ts', 'src/lib/nav.ts']);
});

test('handles require and dynamic import', () => {
	const out = extractImports(
		'src/lib/nav.ts',
		`const u = require('../util.js');\nconst d = await import('./db');`,
		files
	);
	expect(out.sort()).toEqual(['src/lib/db/index.ts', 'src/util.js']);
});

test('resolves python absolute and relative imports', () => {
	const out = extractImports(
		'app/main.py',
		`from app.services.db import connect\nfrom .services import db\nimport os`,
		files
	);
	expect(out.sort()).toEqual(['app/services/__init__.py', 'app/services/db.py']);
});

test('ignores package imports and self-imports', () => {
	expect(extractImports('src/util.js', `import fs from 'node:fs';`, files)).toEqual([]);
	expect(extractImports('src/lib/nav.ts', `import x from './nav';`, files)).toEqual([]);
});
