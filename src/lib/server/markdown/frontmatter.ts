import matter from 'gray-matter';

export interface ParsedFrontmatter {
	data: Record<string, unknown>;
	content: string;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
	const { data, content } = matter(source);
	return { data: data as Record<string, unknown>, content };
}

export function metaFromFrontmatter(data: Record<string, unknown>): {
	title?: string;
	tags?: string[];
	isPublic?: boolean;
} {
	const title = typeof data.title === 'string' ? data.title : undefined;
	const tags = Array.isArray(data.tags)
		? data.tags.filter((t): t is string => typeof t === 'string')
		: undefined;
	const isPublic = typeof data.public === 'boolean' ? data.public : undefined;
	return { title, tags, isPublic };
}
