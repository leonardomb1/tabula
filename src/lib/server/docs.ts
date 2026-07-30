import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from './db';
import { docLinks, docs, docVersions, type Doc, type DocVersion } from './db/schema';
import { newDocId, slugify } from './ids';
import { extractText } from './typst';
import {
	extractMarkdownText,
	extractWikiTargets,
	parseFrontmatter,
	type DocRef
} from './markdown';

export interface CreateDocInput {
	workspaceId: string;
	title: string;
	mode: 'markdown' | 'typst';
	source: string;
	slug?: string;
	tags?: string[];
	isPublic?: boolean;
	frontmatter?: Record<string, unknown>;
	actor: string;
}

export interface UpdateDocPatch {
	title?: string;
	mode?: 'markdown' | 'typst';
	source?: string;
	tags?: string[];
	isPublic?: boolean;
	frontmatter?: Record<string, unknown>;
}

export class DocNotFoundError extends Error {
	constructor(id: string) {
		super(`doc not found: ${id}`);
		this.name = 'DocNotFoundError';
	}
}

async function bodyTextFor(mode: 'markdown' | 'typst', source: string): Promise<string> {
	if (mode === 'typst') return extractText(source);
	return extractMarkdownText(source);
}

export async function resolveDocRefs(
	workspaceId: string,
	refs: string[]
): Promise<Map<string, DocRef>> {
	const map = new Map<string, DocRef>();
	if (refs.length === 0) return map;
	const rows = await db
		.select({ id: docs.id, slug: docs.slug, title: docs.title })
		.from(docs)
		.where(
			and(
				eq(docs.workspaceId, workspaceId),
				isNull(docs.deletedAt),
				or(inArray(docs.slug, refs), inArray(docs.id, refs))
			)
		);
	for (const r of rows) {
		map.set(r.slug, r);
		map.set(r.id, r);
	}
	return map;
}

/** As resolveDocRefs, but only published targets — for wiki rendering. */
export async function resolvePublicDocRefs(
	workspaceId: string,
	refs: string[]
): Promise<Map<string, DocRef>> {
	const map = new Map<string, DocRef>();
	if (refs.length === 0) return map;
	const rows = await db
		.select({ id: docs.id, slug: docs.slug, title: docs.title, publicSlug: docs.publicSlug })
		.from(docs)
		.where(
			and(
				eq(docs.workspaceId, workspaceId),
				eq(docs.isPublic, true),
				isNull(docs.deletedAt),
				or(inArray(docs.slug, refs), inArray(docs.id, refs))
			)
		);
	for (const r of rows) {
		map.set(r.slug, r);
		map.set(r.id, r);
	}
	return map;
}

async function computeLinks(
	workspaceId: string,
	source: string
): Promise<{ targetSlug: string; targetDocId: string | null }[]> {
	const targets = extractWikiTargets(source);
	if (targets.length === 0) return [];
	const resolved = await resolveDocRefs(workspaceId, targets);
	return targets.map((t) => ({ targetSlug: t, targetDocId: resolved.get(t)?.id ?? null }));
}

async function uniqueSlug(workspaceId: string, base: string): Promise<string> {
	const root = base || newDocId(6);
	for (let n = 1; ; n++) {
		const candidate = n === 1 ? root : `${root}-${n}`;
		const existing = await db
			.select({ id: docs.id })
			.from(docs)
			.where(and(eq(docs.workspaceId, workspaceId), eq(docs.slug, candidate)))
			.limit(1);
		if (existing.length === 0) return candidate;
	}
}

function frontmatterFor(
	mode: 'markdown' | 'typst',
	source: string,
	explicit?: Record<string, unknown>
): Record<string, unknown> {
	if (explicit) return explicit;
	return mode === 'markdown' ? parseFrontmatter(source).data : {};
}

export async function createDoc(input: CreateDocInput): Promise<Doc> {
	const id = newDocId();
	const slug = await uniqueSlug(input.workspaceId, input.slug ?? slugify(input.title));
	const bodyText = await bodyTextFor(input.mode, input.source);
	const links = input.mode === 'markdown' ? await computeLinks(input.workspaceId, input.source) : [];

	return db.transaction(async (tx) => {
		const [doc] = await tx
			.insert(docs)
			.values({
				id,
				workspaceId: input.workspaceId,
				slug,
				title: input.title,
				mode: input.mode,
				source: input.source,
				bodyText,
				tags: input.tags ?? [],
				isPublic: input.isPublic ?? false,
				frontmatter: frontmatterFor(input.mode, input.source, input.frontmatter),
				createdBy: input.actor,
				updatedBy: input.actor
			})
			.returning();

		await tx.insert(docVersions).values({
			docId: id,
			versionNo: 1,
			kind: 'edit',
			source: input.source,
			title: input.title,
			editor: input.actor
		});

		if (links.length > 0) {
			await tx.insert(docLinks).values(links.map((l) => ({ sourceDocId: id, ...l })));
		}

		return doc;
	});
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function nextVersionNo(tx: Tx, docId: string): Promise<number> {
	const [row] = await tx
		.select({ n: sql<number>`coalesce(max(${docVersions.versionNo}), 0)` })
		.from(docVersions)
		.where(eq(docVersions.docId, docId));
	return (row?.n ?? 0) + 1;
}

export async function updateDoc(id: string, patch: UpdateDocPatch, actor: string): Promise<Doc> {
	const current = await getDoc(id);
	if (!current) throw new DocNotFoundError(id);

	const mode = patch.mode ?? current.mode;
	const source = patch.source ?? current.source;
	const title = patch.title ?? current.title;
	const sourceChanged = patch.source !== undefined || patch.mode !== undefined;
	const bodyText = sourceChanged ? await bodyTextFor(mode, source) : current.bodyText;
	const links = sourceChanged && mode === 'markdown'
		? await computeLinks(current.workspaceId, source)
		: null;

	return db.transaction(async (tx) => {
		const versionNo = await nextVersionNo(tx, id);
		const [doc] = await tx
			.update(docs)
			.set({
				title,
				mode,
				source,
				bodyText,
				tags: patch.tags ?? current.tags,
				isPublic: patch.isPublic ?? current.isPublic,
				frontmatter: patch.source !== undefined || patch.mode !== undefined
					? frontmatterFor(mode, source, patch.frontmatter)
					: (patch.frontmatter ?? (current.frontmatter as Record<string, unknown>)),
				updatedBy: actor,
				updatedAt: new Date()
			})
			.where(eq(docs.id, id))
			.returning();

		await tx.insert(docVersions).values({
			docId: id,
			versionNo,
			kind: 'edit',
			source,
			title,
			editor: actor
		});

		if (links !== null) {
			await tx.delete(docLinks).where(eq(docLinks.sourceDocId, id));
			if (links.length > 0) {
				await tx.insert(docLinks).values(links.map((l) => ({ sourceDocId: id, ...l })));
			}
		}

		return doc;
	});
}

export async function getBacklinks(doc: {
	id: string;
	slug: string;
	workspaceId: string;
}): Promise<Doc[]> {
	const rows = await db
		.select()
		.from(docLinks)
		.innerJoin(docs, eq(docs.id, docLinks.sourceDocId))
		.where(
			and(
				isNull(docs.deletedAt),
				or(
					eq(docLinks.targetDocId, doc.id),
					and(eq(docLinks.targetSlug, doc.slug), eq(docs.workspaceId, doc.workspaceId))
				)
			)
		);
	const seen = new Map<string, Doc>();
	for (const r of rows) if (!seen.has(r.docs.id)) seen.set(r.docs.id, r.docs);
	return [...seen.values()];
}

export async function softDeleteDoc(id: string, actor: string): Promise<void> {
	const current = await getDoc(id);
	if (!current) throw new DocNotFoundError(id);

	await db.transaction(async (tx) => {
		const versionNo = await nextVersionNo(tx, id);
		await tx.insert(docVersions).values({
			docId: id,
			versionNo,
			kind: 'delete',
			source: current.source,
			title: current.title,
			editor: actor
		});
		await tx.update(docs).set({ deletedAt: new Date(), updatedBy: actor }).where(eq(docs.id, id));
	});
}

export async function restoreDoc(id: string, actor: string): Promise<Doc> {
	const [doc] = await db
		.update(docs)
		.set({ deletedAt: null, updatedBy: actor, updatedAt: new Date() })
		.where(eq(docs.id, id))
		.returning();
	if (!doc) throw new DocNotFoundError(id);
	return doc;
}

export async function restoreVersion(id: string, versionNo: number, actor: string): Promise<Doc> {
	const [snapshot] = await db
		.select()
		.from(docVersions)
		.where(and(eq(docVersions.docId, id), eq(docVersions.versionNo, versionNo)))
		.limit(1);
	if (!snapshot) throw new DocNotFoundError(`${id}@${versionNo}`);
	const current = await getDoc(id);
	if (!current) throw new DocNotFoundError(id);

	const bodyText = await bodyTextFor(current.mode, snapshot.source);

	return db.transaction(async (tx) => {
		const nextNo = await nextVersionNo(tx, id);
		const [doc] = await tx
			.update(docs)
			.set({
				source: snapshot.source,
				title: snapshot.title,
				bodyText,
				updatedBy: actor,
				updatedAt: new Date()
			})
			.where(eq(docs.id, id))
			.returning();

		await tx.insert(docVersions).values({
			docId: id,
			versionNo: nextNo,
			kind: 'restore',
			source: snapshot.source,
			title: snapshot.title,
			editor: actor
		});

		return doc;
	});
}

export async function getDoc(id: string, opts: { includeDeleted?: boolean } = {}): Promise<Doc | null> {
	const where = opts.includeDeleted
		? eq(docs.id, id)
		: and(eq(docs.id, id), isNull(docs.deletedAt));
	const [doc] = await db.select().from(docs).where(where).limit(1);
	return doc ?? null;
}

export async function getDocBySlug(workspaceId: string, slug: string): Promise<Doc | null> {
	const [doc] = await db
		.select()
		.from(docs)
		.where(and(eq(docs.workspaceId, workspaceId), eq(docs.slug, slug), isNull(docs.deletedAt)))
		.limit(1);
	return doc ?? null;
}

export async function listDocs(workspaceId: string): Promise<Doc[]> {
	return db
		.select()
		.from(docs)
		.where(and(eq(docs.workspaceId, workspaceId), isNull(docs.deletedAt)))
		.orderBy(desc(docs.updatedAt));
}

export async function listVersions(docId: string): Promise<DocVersion[]> {
	return db
		.select()
		.from(docVersions)
		.where(eq(docVersions.docId, docId))
		.orderBy(desc(docVersions.versionNo));
}
