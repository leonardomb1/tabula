export type WikiMode = 'off' | 'org' | 'anonymous';

/** 'off' hides the wiki; 'org' requires a session; 'anonymous' serves everyone. */
export function wikiMode(): WikiMode {
	const raw = process.env.WIKI_MODE ?? 'org';
	return raw === 'anonymous' || raw === 'off' ? raw : 'org';
}
