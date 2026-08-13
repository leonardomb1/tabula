export type WikiMode = 'off' | 'org' | 'anonymous';

/** 'off' hides the wiki; 'org' requires a session; 'anonymous' serves everyone. */
export function wikiMode(): WikiMode {
	const raw = process.env.WIKI_MODE || 'org';
	return raw === 'anonymous' || raw === 'off' ? raw : 'org';
}

/** First value of a possibly comma-joined proxy header. */
function firstValue(raw: string | null): string {
	return (raw ?? '').split(',')[0].trim().toLowerCase();
}

/** Drop the port when it is the scheme's default, so hosts compare equal. */
function hostKey(host: string, scheme: string): string {
	if (scheme === 'https' && host.endsWith(':443')) return host.slice(0, -4);
	if (scheme === 'http' && host.endsWith(':80')) return host.slice(0, -3);
	return host;
}

/**
 * Whether the client reached us on the host ORIGIN names. adapter-node rewrites
 * event.url to ORIGIN, so the comparison has to use the raw (proxied) headers.
 * A mismatch means this is some other entry point — a public wiki hostname in
 * front of an app that lives elsewhere — where sending someone to /login would
 * land them on a sign-in page that is not theirs.
 */
export function hostMatchesOrigin(request: Request): boolean {
	const origin = process.env.ORIGIN?.trim();
	if (!origin) return true;

	let expected: string;
	try {
		expected = new URL(origin).host.toLowerCase();
	} catch {
		return true;
	}

	const host = firstValue(request.headers.get('x-forwarded-host') ?? request.headers.get('host'));
	if (!host) return true;

	const scheme = firstValue(request.headers.get('x-forwarded-proto')) || 'http';
	return hostKey(host, scheme) === expected;
}
