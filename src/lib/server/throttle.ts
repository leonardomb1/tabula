/** Small in-memory sliding-window throttle, per instance. */

const hits = new Map<string, number[]>();

export function throttled(key: string, max = 10, windowMs = 60_000): boolean {
	const now = Date.now();
	const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
	if (recent.length >= max) {
		hits.set(key, recent);
		return true;
	}
	recent.push(now);
	hits.set(key, recent);
	if (hits.size > 10_000) {
		for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
	}
	return false;
}
