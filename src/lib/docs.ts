export type SortMode = 'recent' | 'alpha';

export interface ListedDoc {
	id: string;
	slug: string;
	title: string;
	mode: 'markdown' | 'typst';
	tags: string[];
	isPublic: boolean;
	updatedAt: Date;
	excerpt: string;
}

export interface DocsPage {
	docs: ListedDoc[];
	total: number;
	limit: number;
	hasMore: boolean;
}

export interface TagCount {
	tag: string;
	count: number;
}

export const DEFAULT_LIMIT = 40;
export const MAX_LIMIT = 400;

export function parseTagsParam(raw: string | null): string[] {
	return (raw ?? '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}

export function parseSort(raw: string | null): SortMode {
	return raw === 'alpha' ? 'alpha' : 'recent';
}

export function parseLimit(raw: string | null): number {
	if (!raw) return DEFAULT_LIMIT;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
	return Math.min(Math.trunc(n), MAX_LIMIT);
}
