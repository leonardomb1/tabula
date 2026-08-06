/**
 * The publication engine. The wiki serves the approved snapshot
 * (publishedVersionNo). Publishing model:
 *   - maintainers publish/unpublish directly;
 *   - an editor with makePublic publishes directly, unless the workspace requires
 *     approval (approvePublic) — then a single maintainer approves or rejects;
 *   - unpublishing is never gated;
 *   - edits to a published doc update its snapshot immediately (no re-review).
 */

import { and, desc, eq, inArray, isNull, isNotNull, notInArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	attachments,
	docReviews,
	docVersions,
	docs,
	workspaces,
	type Doc,
	type DocReview
} from './db/schema';
import { getPolicy } from './workspaces';
import { slugify } from './ids';
import type { Access } from './access';
import { canMakePublic, needsPublishApproval } from '$lib/policy';

export type PublishOutcome = 'published' | 'pending' | 'forbidden';
export type ApprovalOutcome = 'approved' | 'rejected' | 'forbidden' | 'none';

async function latestVersionNo(docId: string): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`coalesce(max(${docVersions.versionNo}), 0)` })
		.from(docVersions)
		.where(eq(docVersions.docId, docId));
	return row?.n ?? 0;
}

async function uniquePublicSlug(title: string, docId: string): Promise<string> {
	const base = slugify(title) || docId;
	for (let i = 0; ; i++) {
		const candidate = i === 0 ? base : `${base}-${i + 1}`;
		const [hit] = await db
			.select({ id: docs.id })
			.from(docs)
			.where(eq(docs.publicSlug, candidate))
			.limit(1);
		if (!hit || hit.id === docId) return candidate;
	}
}

const ATTACHMENT_REF = /\/api\/attachments\/([a-z0-9]+)/g;

/**
 * Recompute which of a workspace's attachments the wiki exposes: exactly those
 * referenced by the source each published doc actually serves (its snapshot).
 */
async function syncAttachmentExposure(workspaceId: string): Promise<void> {
	const published = await db
		.select({ id: docs.id, source: docs.source, publishedVersionNo: docs.publishedVersionNo })
		.from(docs)
		.where(and(eq(docs.workspaceId, workspaceId), eq(docs.isPublic, true), isNull(docs.deletedAt)));

	const refs = new Set<string>();
	for (const d of published) {
		let src = d.source;
		if (d.publishedVersionNo !== null) {
			const [v] = await db
				.select({ source: docVersions.source })
				.from(docVersions)
				.where(and(eq(docVersions.docId, d.id), eq(docVersions.versionNo, d.publishedVersionNo)))
				.limit(1);
			if (v) src = v.source;
		}
		for (const m of src.matchAll(ATTACHMENT_REF)) refs.add(m[1]);
	}

	if (refs.size > 0) {
		const ids = [...refs];
		await db
			.update(attachments)
			.set({ isPublic: true })
			.where(and(eq(attachments.workspaceId, workspaceId), inArray(attachments.id, ids)));
		await db
			.update(attachments)
			.set({ isPublic: false })
			.where(and(eq(attachments.workspaceId, workspaceId), notInArray(attachments.id, ids)));
	} else {
		await db
			.update(attachments)
			.set({ isPublic: false })
			.where(eq(attachments.workspaceId, workspaceId));
	}
}

async function publishNow(doc: Doc): Promise<void> {
	const publicSlug = doc.publicSlug ?? (await uniquePublicSlug(doc.title, doc.id));
	await db
		.update(docs)
		.set({ isPublic: true, publicSlug, publishedVersionNo: await latestVersionNo(doc.id) })
		.where(eq(docs.id, doc.id));
	await syncAttachmentExposure(doc.workspaceId);
}

async function resolveRequest(
	docId: string,
	state: 'approved' | 'rejected',
	by?: string
): Promise<void> {
	await db
		.update(docReviews)
		.set({ state, resolvedBy: by ?? null, resolvedAt: new Date() })
		.where(
			and(eq(docReviews.docId, docId), eq(docReviews.kind, 'publish'), eq(docReviews.state, 'open'))
		);
}

/** The open publish request for a doc, if any. */
export async function openPublishRequest(docId: string): Promise<DocReview | null> {
	const [row] = await db
		.select()
		.from(docReviews)
		.where(
			and(eq(docReviews.docId, docId), eq(docReviews.kind, 'publish'), eq(docReviews.state, 'open'))
		)
		.orderBy(desc(docReviews.id))
		.limit(1);
	return row ?? null;
}

/** Never gated. Keeps publicSlug so a re-publish restores old links. */
export async function unpublish(docId: string): Promise<void> {
	const [doc] = await db.select().from(docs).where(eq(docs.id, docId)).limit(1);
	await db.update(docs).set({ isPublic: false, publishedVersionNo: null }).where(eq(docs.id, docId));
	await resolveRequest(docId, 'rejected');
	if (doc) await syncAttachmentExposure(doc.workspaceId);
}

/** Publish, or open a pending request when the publisher needs approval. */
export async function requestPublish(doc: Doc, access: Access): Promise<PublishOutcome> {
	const policy = await getPolicy(doc.workspaceId);
	const role = access.role(doc.workspaceId);
	if (!canMakePublic(policy, role)) return 'forbidden';

	if (!needsPublishApproval(policy, role)) {
		await publishNow(doc);
		return 'published';
	}

	if (!(await openPublishRequest(doc.id))) {
		await db.insert(docReviews).values({
			docId: doc.id,
			kind: 'publish',
			versionNo: await latestVersionNo(doc.id),
			requestedBy: access.principal.username
		});
	}
	return 'pending';
}

/** Maintainer approves a pending publication -> it goes live. */
export async function approvePublish(docId: string, access: Access): Promise<ApprovalOutcome> {
	const [doc] = await db.select().from(docs).where(eq(docs.id, docId)).limit(1);
	if (!doc) return 'none';
	if (!access.can(doc.workspaceId, 'maintainer')) return 'forbidden';
	if (!(await openPublishRequest(docId))) return 'none';
	await publishNow(doc);
	await resolveRequest(docId, 'approved', access.principal.username);
	return 'approved';
}

/** Maintainer rejects a pending publication -> it stays private. */
export async function rejectPublish(docId: string, access: Access): Promise<ApprovalOutcome> {
	const [doc] = await db.select().from(docs).where(eq(docs.id, docId)).limit(1);
	if (!doc) return 'none';
	if (!access.can(doc.workspaceId, 'maintainer')) return 'forbidden';
	if (!(await openPublishRequest(docId))) return 'none';
	await resolveRequest(docId, 'rejected', access.principal.username);
	return 'rejected';
}

/** After every edit: a published doc's snapshot follows the live source immediately. */
export async function onDocUpdated(doc: Doc): Promise<void> {
	if (!doc.isPublic) return;
	await db
		.update(docs)
		.set({ publishedVersionNo: await latestVersionNo(doc.id) })
		.where(eq(docs.id, doc.id));
	await syncAttachmentExposure(doc.workspaceId);
}

export interface PendingPublication {
	id: number;
	docId: string;
	docTitle: string;
	docSlug: string;
	workspaceId: string;
	requestedBy: string;
	createdAt: Date;
}

export async function listPendingPublications(
	workspaceIds?: string[]
): Promise<PendingPublication[]> {
	const rows = await db
		.select({
			id: docReviews.id,
			docId: docReviews.docId,
			docTitle: docs.title,
			docSlug: docs.slug,
			workspaceId: docs.workspaceId,
			requestedBy: docReviews.requestedBy,
			createdAt: docReviews.createdAt
		})
		.from(docReviews)
		.innerJoin(docs, eq(docs.id, docReviews.docId))
		.where(
			and(eq(docReviews.kind, 'publish'), eq(docReviews.state, 'open'), isNull(docs.deletedAt))
		)
		.orderBy(desc(docReviews.createdAt));
	const scoped = workspaceIds ? rows.filter((r) => workspaceIds.includes(r.workspaceId)) : rows;
	return scoped.map((r) => ({ ...r, requestedBy: r.requestedBy ?? '' }));
}

export interface PublishedDoc {
	id: string;
	title: string;
	publicSlug: string;
	workspaceId: string;
	workspaceName: string;
	publishedVersionNo: number | null;
	updatedAt: Date;
	tags: string[];
}

/** Docs made public before the wiki existed lack a slug/snapshot; heal them. */
async function backfillLegacyPublished(): Promise<void> {
	const legacy = await db
		.select()
		.from(docs)
		.where(and(eq(docs.isPublic, true), sql`${docs.publicSlug} IS NULL`, isNull(docs.deletedAt)));
	for (const doc of legacy) await publishNow(doc);
}

export async function listPublishedDocs(): Promise<PublishedDoc[]> {
	await backfillLegacyPublished();
	const rows = await db
		.select({
			id: docs.id,
			title: docs.title,
			publicSlug: docs.publicSlug,
			workspaceId: docs.workspaceId,
			workspaceName: workspaces.name,
			publishedVersionNo: docs.publishedVersionNo,
			updatedAt: docs.updatedAt,
			tags: docs.tags
		})
		.from(docs)
		.innerJoin(workspaces, eq(workspaces.id, docs.workspaceId))
		.where(and(eq(docs.isPublic, true), isNotNull(docs.publicSlug), isNull(docs.deletedAt)))
		.orderBy(desc(docs.updatedAt));
	return rows.filter((r): r is typeof r & { publicSlug: string } => r.publicSlug !== null);
}

/** The wiki article: the approved snapshot's source, not the live one. */
export async function getPublishedDoc(
	publicSlug: string
): Promise<{ doc: Doc; source: string; title: string } | null> {
	const [doc] = await db
		.select()
		.from(docs)
		.where(and(eq(docs.publicSlug, publicSlug), eq(docs.isPublic, true), isNull(docs.deletedAt)))
		.limit(1);
	if (!doc) return null;

	if (doc.publishedVersionNo !== null) {
		const [v] = await db
			.select({ source: docVersions.source, title: docVersions.title })
			.from(docVersions)
			.where(and(eq(docVersions.docId, doc.id), eq(docVersions.versionNo, doc.publishedVersionNo)))
			.limit(1);
		if (v) return { doc, source: v.source, title: v.title || doc.title };
	}
	return { doc, source: doc.source, title: doc.title };
}
