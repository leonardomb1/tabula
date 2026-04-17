#!/usr/bin/env bun
/**
 * Convert a dotenv file into the JSON shape `wrangler secret bulk` expects,
 * so you can upload every secret in one command.
 *
 * Usage:
 *   bun scripts/env-to-cf-secrets.ts          # reads .env, writes .cf-secrets.json
 *   bun scripts/env-to-cf-secrets.ts custom.env out.json
 *
 * Then:
 *   bunx wrangler secret bulk .cf-secrets.json
 *
 * The output file is gitignored.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const inFile = process.argv[2] ?? '.env';
const outFile = process.argv[3] ?? '.cf-secrets.json';

const raw = readFileSync(inFile, 'utf-8');
const secrets: Record<string, string> = {};

for (const line of raw.split('\n')) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith('#')) continue;

	// KEY=value  or  KEY="value with #"  — quoted values can contain inline #.
	// Unquoted values are terminated by the first whitespace+# (inline comment).
	const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
	if (!match) continue;
	const [, key, rest] = match;

	let value = rest;
	const quoted = value.match(/^"((?:[^"\\]|\\.)*)"|^'((?:[^'\\]|\\.)*)'/);
	if (quoted) {
		value = quoted[1] ?? quoted[2] ?? '';
	} else {
		// Strip inline # comments (not inside quotes).
		const commentIdx = value.indexOf(' #');
		if (commentIdx !== -1) value = value.slice(0, commentIdx);
		value = value.trim();
	}

	secrets[key] = value;
}

writeFileSync(outFile, JSON.stringify(secrets, null, 2) + '\n');
console.log(`Wrote ${Object.keys(secrets).length} keys from ${inFile} → ${outFile}`);
console.log(`Upload with:  bunx wrangler secret bulk ${outFile}`);
