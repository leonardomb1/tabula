/**
 * User-authored Typst templates that wrap a document at PDF export time. A template
 * owns the whole page and calls cmarker itself; metadata reaches it via sys.inputs.
 */

import { and, asc, eq } from 'drizzle-orm';
import { db } from './db';
import { docTemplates, type Doc, type DocTemplate } from './db/schema';
import { newDocId, slugify } from './ids';
import { readBranding } from './branding';
import { formalNameFor } from './userSettings';

/** The complete Typst document a new template opens with. */
export const STARTER_TEMPLATE = `#import "@preview/cmarker:0.1.6"

#let title = sys.inputs.at("title", default: "")
#let company = sys.inputs.at("company", default: "")
#let author = sys.inputs.at("author", default: "")
#let date = sys.inputs.at("date", default: "")
#let tags = sys.inputs.at("tags", default: "")
#let accent = rgb(sys.inputs.at("brandColor", default: "#b4502f"))

#set page(
  margin: (x: 2.2cm, y: 2.4cm),
  header: context if counter(page).get().first() > 1 {
    set text(size: 8pt, fill: luma(130))
    grid(columns: (1fr, auto), align(left)[#title], align(right)[#company])
  },
  footer: context {
    set text(size: 8pt, fill: luma(130))
    grid(
      columns: (1fr, auto),
      align(left)[#date],
      align(right)[#counter(page).display("1 / 1", both: true)],
    )
  },
)

#set text(size: 11pt, lang: "pt")
#set par(justify: true)
#show heading.where(level: 1): it => block(below: 0.8em)[
  #set text(size: 16pt, weight: 700, fill: accent)
  #it.body
]

#align(center + horizon)[
  #text(size: 24pt, weight: 700)[#title]
  #v(0.6em)
  #if author != "" [#text(size: 11pt, fill: luma(90))[#author] #linebreak()]
  #if tags != "" [#text(size: 9pt, fill: luma(120))[#tags]]
  #v(2em)
  #line(length: 30%, stroke: 1pt + accent)
  #v(0.6em)
  #text(size: 10pt, fill: luma(110))[#company]
]

#pagebreak()

#cmarker.render(read("/doc.md"), raw-typst: true)
`;

/** Canned markdown a template is previewed against in the template editor. */
export const SAMPLE_DOC = `# Título de exemplo

Este documento de exemplo mostra como o modelo formata os elementos mais comuns
de um documento real antes de ser aplicado.

## Texto e listas

Um parágrafo com **negrito**, *itálico* e \`código inline\`, seguido de uma lista:

- Primeiro item
- Segundo item
- Terceiro item

> Uma citação curta para conferir o estilo de bloco.

## Tabela e código

| Coluna A | Coluna B |
| --- | --- |
| Valor 1 | Valor 2 |
| Valor 3 | Valor 4 |

\`\`\`
tabula export --template este-modelo
\`\`\`
`;

export interface TemplateOption {
	key: string;
	type: 'text' | 'boolean' | 'list';
	default: string;
	help: string;
}

export interface TemplateMeta {
	description: string;
	options: TemplateOption[];
}

const DESCRIPTION_RE = /^\s*\/\/\s*@description\s+(.+)$/;
const OPTION_RE =
	/^\s*\/\/\s*@option\s+([\w.-]+)\s+(text|boolean|list)\s+(?:"([^"]*)"|(\S+))\s*(.*)$/;

/** Reads the `@description` and `@option` header lines that drive the export dialog. */
export function parseTemplateMeta(source: string): TemplateMeta {
	let description = '';
	const options: TemplateOption[] = [];

	for (const line of source.split('\n')) {
		if (!line.trimStart().startsWith('//')) {
			if (line.trim() !== '' && !line.trimStart().startsWith('#import')) break;
			continue;
		}
		const desc = line.match(DESCRIPTION_RE);
		if (desc) {
			description = desc[1].trim();
			continue;
		}
		const opt = line.match(OPTION_RE);
		if (opt) {
			options.push({
				key: opt[1],
				type: opt[2] as TemplateOption['type'],
				default: opt[3] ?? opt[4] ?? '',
				help: (opt[5] ?? '').trim()
			});
		}
	}

	return { description, options };
}

export async function listTemplates(workspaceId: string): Promise<DocTemplate[]> {
	return db
		.select()
		.from(docTemplates)
		.where(eq(docTemplates.workspaceId, workspaceId))
		.orderBy(asc(docTemplates.name));
}

export async function getTemplate(
	workspaceId: string,
	slug: string
): Promise<DocTemplate | null> {
	const [row] = await db
		.select()
		.from(docTemplates)
		.where(and(eq(docTemplates.workspaceId, workspaceId), eq(docTemplates.slug, slug)))
		.limit(1);
	return row ?? null;
}

export async function createTemplate(input: {
	workspaceId: string;
	name: string;
	slug?: string;
	source?: string;
	actor: string;
}): Promise<DocTemplate> {
	const base = input.slug || slugify(input.name) || newDocId(6);
	let slug = base;
	for (let n = 2; await getTemplate(input.workspaceId, slug); n++) slug = `${base}-${n}`;

	const [row] = await db
		.insert(docTemplates)
		.values({
			id: newDocId(),
			workspaceId: input.workspaceId,
			slug,
			name: input.name,
			source: input.source ?? STARTER_TEMPLATE,
			createdBy: input.actor
		})
		.returning();
	return row;
}

export async function updateTemplate(
	workspaceId: string,
	slug: string,
	patch: { name?: string; source?: string }
): Promise<DocTemplate | null> {
	const [row] = await db
		.update(docTemplates)
		.set({ ...patch, updatedAt: new Date() })
		.where(and(eq(docTemplates.workspaceId, workspaceId), eq(docTemplates.slug, slug)))
		.returning();
	return row ?? null;
}

export async function deleteTemplate(workspaceId: string, slug: string): Promise<boolean> {
	const rows = await db
		.delete(docTemplates)
		.where(and(eq(docTemplates.workspaceId, workspaceId), eq(docTemplates.slug, slug)))
		.returning({ id: docTemplates.id });
	return rows.length > 0;
}

/** An explicit choice wins, then the document's `template:` front matter, then none. */
export async function resolveTemplate(
	doc: Pick<Doc, 'workspaceId' | 'frontmatter'>,
	explicitSlug?: string | null
): Promise<DocTemplate | null> {
	const fromFrontmatter = (doc.frontmatter as Record<string, unknown>)?.template;
	const slug =
		explicitSlug?.trim() || (typeof fromFrontmatter === 'string' ? fromFrontmatter.trim() : '');
	if (!slug) return null;
	return getTemplate(doc.workspaceId, slug);
}

function frontmatterInputs(frontmatter: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	if (!frontmatter || typeof frontmatter !== 'object') return out;

	for (const [key, value] of Object.entries(frontmatter as Record<string, unknown>)) {
		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			out[`fm.${key}`] = String(value);
		} else if (Array.isArray(value) && value.every((v) => typeof v !== 'object')) {
			out[`fm.${key}`] = value.join(', ');
		}
	}
	return out;
}

/** Document-level keys every template can read; also the editor's completion list. */
export const TEMPLATE_INPUT_KEYS = [
	'title',
	'slug',
	'author',
	'date',
	'tags',
	'workspace',
	'company',
	'brandName',
	'brandColor'
];

/** Everything a template reads via sys.inputs. Dialog overrides land in `fm.*`. */
/** What a template renders about — a stored document, or ephemeral content. */
export interface TemplateSubject {
	title: string;
	slug: string;
	tags: string[];
	workspaceId: string;
	date: Date;
	/** Already-resolved display name; not a login. */
	author: string;
	frontmatter?: unknown;
}

/** Inputs for content that is not a stored document, e.g. an on-demand render. */
export function subjectInputs(
	subject: TemplateSubject,
	overrides: Record<string, string> = {}
): Record<string, string> {
	const branding = readBranding();
	const optionOverrides = Object.fromEntries(
		Object.entries(overrides).map(([k, v]) => [`fm.${k}`, v])
	);
	return {
		...frontmatterInputs(subject.frontmatter),
		...optionOverrides,
		title: subject.title,
		slug: subject.slug,
		author: subject.author,
		date: subject.date.toISOString().slice(0, 10),
		tags: subject.tags.join(', '),
		workspace: subject.workspaceId,
		company: branding.company,
		brandName: branding.name,
		brandColor: branding.color
	};
}

export async function templateInputs(
	doc: Doc,
	overrides: Record<string, string> = {}
): Promise<Record<string, string>> {
	return subjectInputs(
		{
			title: doc.title,
			slug: doc.slug,
			tags: doc.tags,
			workspaceId: doc.workspaceId,
			date: doc.updatedAt,
			author: await formalNameFor(doc.updatedBy ?? doc.createdBy),
			frontmatter: doc.frontmatter
		},
		overrides
	);
}
