import { metaFromFrontmatter, parseFrontmatter } from './markdown';

export interface DocFormValues {
	title: string;
	tags: string[];
	mode: 'markdown' | 'typst';
	source: string;
	isPublic: boolean;
	frontmatter: Record<string, unknown>;
}

export function readDocForm(data: FormData): DocFormValues {
	const mode = data.get('mode') === 'typst' ? 'typst' : 'markdown';
	const source = String(data.get('source') ?? '');
	const formTitle = String(data.get('title') ?? '').trim();
	const formTags = String(data.get('tags') ?? '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
	const formPublic = data.get('isPublic') === 'on';

	const parsed = mode === 'markdown' ? parseFrontmatter(source) : { data: {}, content: source };
	const meta = metaFromFrontmatter(parsed.data);

	return {
		title: meta.title ?? formTitle,
		tags: meta.tags ?? formTags,
		mode,
		source,
		isPublic: meta.isPublic ?? formPublic,
		frontmatter: parsed.data
	};
}
