/**
 * Records one read from the browser, after the page has actually rendered.
 * Best-effort and deliberately silent: a lost count is not worth an error.
 */

const counted = new Set<string>();

export function countView(docId: string, source: 'app' | 'wiki'): void {
	const key = `${source}:${docId}`;
	if (counted.has(key)) return;
	counted.add(key);
	void fetch('/api/views', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id: docId, source }),
		keepalive: true
	}).catch(() => {});
}
