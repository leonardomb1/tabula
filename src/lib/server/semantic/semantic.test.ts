/**
 * The DB-free half of the semantic index: chunking (shared shape with
 * PerguntAI) and the embedding client's packing and retry behavior.
 *
 *   bun test src/lib/server/semantic
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { chunkText } from './chunk';
import {
	embedTexts,
	embedQuery,
	vectorLiteral,
	embeddingColumn,
	literalDimensions
} from './embeddings';

const ENV = { ...process.env };
afterEach(() => {
	process.env = { ...ENV };
});

test('markdown chunks carry their heading trail', () => {
	const md = [
		'# Manual',
		'intro',
		'## Compras',
		'como comprar',
		'### Aprovação',
		'fluxo de aprovação',
		'## Vendas',
		'como vender'
	].join('\n\n');
	const chunks = chunkText(md);
	expect(chunks.find((c) => c.includes('fluxo'))).toStartWith('[Manual > Compras > Aprovação]');
	expect(chunks.find((c) => c.includes('vender'))).toStartWith('[Manual > Vendas]');
});

test('a # in a code fence is not a heading; bodiless siblings stack as one title', () => {
	const md = [
		'# DOC 01 — LGPD',
		'# FONTE: https://x',
		'Art. 1º dispõe sobre dados.',
		'```',
		'# não é heading',
		'```',
		'# DOC 02 — MCI',
		'# FONTE: https://y',
		'Art. 1º marco civil.'
	].join('\n');
	const chunks = chunkText(md);
	expect(chunks.find((c) => c.includes('dispõe'))).toStartWith('[DOC 01 — LGPD > FONTE: https://x]');
	expect(chunks.find((c) => c.includes('marco civil'))).toStartWith('[DOC 02 — MCI > FONTE: https://y]');
});

test('plain text splits by size; a lone title gets no trail', () => {
	const long = Array.from({ length: 120 }, (_, i) => `Frase ${i} com algum recheio de texto.`).join(' ');
	expect(chunkText(long).length).toBeGreaterThan(1);
	expect(chunkText('# Título\nsó um parágrafo.').every((c) => !c.startsWith('['))).toBe(true);
});

test('vectorLiteral is the pgvector form and normalizes -0', () => {
	expect(vectorLiteral(new Float32Array([0.5, -0, 1]))).toBe('[0.5,0,1]');
});

let server: ReturnType<typeof Bun.serve>;
let failures = 0;
beforeAll(() => {
	server = Bun.serve({
		port: 47905,
		async fetch(req) {
			if (failures > 0) {
				failures--;
				return new Response('{"error":"throttled"}', { status: 429, headers: { 'retry-after': '1' } });
			}
			const { input } = (await req.json()) as { input: string[] };
			return Response.json({
				data: input.map((t, index) => ({ index, embedding: [t.length, 1, 0] }))
			});
		}
	});
});
afterAll(() => server.stop(true));

test('embedTexts returns unit-vector literals; embedQuery matches', async () => {
	process.env.EMBEDDINGS_BASE_URL = 'http://127.0.0.1:47905/v1';
	const [a] = await embedTexts(['xx']);
	expect(a.startsWith('[') && a.endsWith(']')).toBe(true);
	const parts = a.slice(1, -1).split(',').map(Number);
	expect(Math.hypot(...parts)).toBeCloseTo(1, 5);
	expect(await embedQuery('xx')).toBe(a);
});

test('429 with Retry-After is waited out', async () => {
	process.env.EMBEDDINGS_BASE_URL = 'http://127.0.0.1:47905/v1';
	failures = 2;
	const t0 = performance.now();
	const out = await embedTexts(['a', 'b']);
	expect(out.length).toBe(2);
	expect(performance.now() - t0).toBeGreaterThan(1900);
}, 20_000);

test('embeddingColumn whitelists the multi-dimension columns (0008)', () => {
	expect(embeddingColumn(1024)).toBe('embedding_1024');
	expect(embeddingColumn(1536)).toBe('embedding_1536');
	expect(() => embeddingColumn(4096)).toThrow(/no column for 4096/);
	expect(() => embeddingColumn(0)).toThrow();
});

test('literalDimensions reads a vector literal without parsing it', () => {
	expect(literalDimensions(vectorLiteral(new Float32Array([1, 0, 0])))).toBe(3);
	expect(literalDimensions(vectorLiteral(new Float32Array(1024)))).toBe(1024);
});

test('EMBEDDINGS_DIMENSIONS rides as `dimensions` (or output_dimension for Voyage)', async () => {
	const bodies: Record<string, unknown>[] = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body));
		bodies.push(body);
		const n = Array.isArray(body.input) ? body.input.length : 1;
		return Response.json({
			data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0] }))
		});
	}) as typeof fetch;
	try {
		process.env.EMBEDDINGS_BASE_URL = 'https://azure.example/v1';
		process.env.EMBEDDINGS_DIMENSIONS = '1024';
		await embedQuery('x');
		expect(bodies[0].dimensions).toBe(1024);
		expect(bodies[0].output_dimension).toBeUndefined();

		process.env.EMBEDDINGS_BASE_URL = 'https://api.voyageai.com/v1';
		await embedQuery('x');
		expect(bodies[1].output_dimension).toBe(1024);
		expect(bodies[1].dimensions).toBeUndefined();

		delete process.env.EMBEDDINGS_DIMENSIONS;
		await embedQuery('x');
		expect(bodies[2].dimensions).toBeUndefined();
		expect(bodies[2].output_dimension).toBeUndefined();
	} finally {
		globalThis.fetch = realFetch;
	}
});
