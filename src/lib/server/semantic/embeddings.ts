
/**
 * Embedding client for any OpenAI-compatible `/embeddings` endpoint — Azure
 * OpenAI, Ollama, vLLM, OpenAI itself. Configured entirely by env (see
 * .env.example); with EMBEDDINGS_BASE_URL unset, search stays purely lexical
 * and the indexer never starts.
 *
 * Vectors are L2-normalized here once, so cosine distance in pgvector and any
 * in-process similarity agree exactly. They travel to Postgres in the `[…]`
 * literal form the vector type parses.
 */

const BATCH = 128;
/** Character budget per request, under typical 8k-token embedding limits. */
const BATCH_CHARS = 100_000;

export function embeddingsConfigured(): boolean {
	return !!process.env.EMBEDDINGS_BASE_URL;
}

/** Identifies which model produced a stored vector, so a swap re-embeds. */
export function embeddingsModel(): string {
	return process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';
}

function timeoutMs(): number {
	const n = Number(process.env.EMBEDDINGS_TIMEOUT_MS || 30_000);
	return Number.isFinite(n) && n > 0 ? n : 30_000;
}

function normalize(vector: number[]): Float32Array {
	let sq = 0;
	for (const v of vector) sq += v * v;
	const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0;
	const out = new Float32Array(vector.length);
	for (let i = 0; i < vector.length; i++) out[i] = vector[i] * inv;
	return out;
}

/** The `[x,y,…]` literal pgvector's type parses. */
export function vectorLiteral(vector: Float32Array): string {
	return `[${Array.from(vector, (v) => (Object.is(v, -0) ? 0 : v)).join(',')}]`;
}

const MAX_RETRIES = 6;
/** Backoff ceiling — a Retry-After beyond this means the quota is the problem. */
const MAX_RETRY_WAIT_MS = 65_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestEmbeddings(inputs: string[]): Promise<Float32Array[]> {
	const base = process.env.EMBEDDINGS_BASE_URL!.replace(/\/+$/, '');
	const key = process.env.EMBEDDINGS_API_KEY ?? '';

	let res: Response;
	for (let attempt = 0; ; attempt++) {
		res = await fetch(`${base}/embeddings`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				// Both header styles: Azure wants api-key, everyone else a bearer.
				...(key ? { authorization: `Bearer ${key}`, 'api-key': key } : {})
			},
			body: JSON.stringify({ model: embeddingsModel(), input: inputs }),
			signal: AbortSignal.timeout(timeoutMs())
		});
		// Azure S0 quotas throttle a large document mid-way as a matter of course;
		// waiting out Retry-After is normal operation, not an error. 5xx gets the
		// same patience, capped, so a blip does not un-embed a 1,600-chunk upload.
		if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
			const after = Number(res.headers.get('retry-after'));
			const wait = Math.min(
				Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** attempt,
				MAX_RETRY_WAIT_MS
			);
			await res.body?.cancel().catch(() => {});
			await sleep(wait);
			continue;
		}
		break;
	}
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`embeddings: ${res.status} ${detail.slice(0, 200)}`);
	}

	const data = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
	if (!Array.isArray(data.data) || data.data.length !== inputs.length) {
		throw new Error('embeddings: response length does not match input');
	}
	const out = new Array<Float32Array>(inputs.length);
	for (const item of data.data) out[item.index] = normalize(item.embedding);
	return out;
}

/**
 * Embed a batch of texts as pgvector literals. Batches by count and by size so
 * one oversized chunk cannot fail the whole document. Throws on provider
 * errors — callers decide whether that degrades to lexical-only or aborts.
 */
export async function embedTexts(texts: string[]): Promise<string[]> {
	const out = new Array<string>(texts.length);
	let start = 0;
	while (start < texts.length) {
		let end = start;
		let chars = 0;
		while (end < texts.length && end - start < BATCH && chars < BATCH_CHARS) {
			chars += texts[end].length;
			end++;
		}
		const vectors = await requestEmbeddings(texts.slice(start, end));
		for (let i = 0; i < vectors.length; i++) out[start + i] = vectorLiteral(vectors[i]);
		start = end;
	}
	return out;
}

export async function embedQuery(text: string): Promise<string> {
	const [vector] = await requestEmbeddings([text]);
	return vectorLiteral(vector);
}
