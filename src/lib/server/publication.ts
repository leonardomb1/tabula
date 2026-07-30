/**
 * The publication engine: turns the policy spec (allowPublic, makePublic,
 * approvePublic, quorum, approvers, maintainerBypass, selfApprove, review.mode)
 * into behavior. The wiki serves the approved snapshot (publishedVersionNo),
 * never the live source, so under review.mode 'all' edits stay internal until
 * re-approved. Unpublishing is never gated, matching the spec.
 */

import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { db } from './db';
import { docReviews, docReviewVotes, docVersions, docs, type Doc, type DocReview } from './db/schema';
import { getPolicy } from './workspaces';
import { slugify } from './ids';
import type { Access } from './access';
import { canMakePublic, isApprover, type WorkspacePolicy } from '$lib/policy';

export type PublishOutcome = 'published' | 'pending' | 'forbidden';

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

async function publishNow(doc: Doc): Promise<void> {
	const publicSlug = doc.publicSlug ?? (await uniquePublicSlug(doc.title, doc.id));
	await db
		.update(docs)
		.set({ isPublic: true, publicSlug, publishedVersionNo: await latestVersionNo(doc.id) })
		.where(eq(docs.id, doc.id));
}

/** Never review-gated; publicSlug is kept so a re-publish restores old links. */
export async function unpublish(docId: string): Promise<void> {
	await db.update(docs).set({ isPublic: false, publishedVersionNo: null }).where(eq(docs.id, docId));
	await db
		.update(docReviews)
		.set({ state: 'rejected', resolvedAt: new Date() })
		.where(and(eq(docReviews.docId, docId), eq(docReviews.kind, 'publish'), eq(docReviews.state, 'open')));
}

export async function openReview(docId: string, kind: string): Promise<DocReview | null> {
	const [row] = await db
		.select()
		.from(docReviews)
		.where(and(eq(docReviews.docId, docId), eq(docReviews.kind, kind), eq(docReviews.state, 'open')))
		.orderBy(desc(docReviews.id))
		.limit(1);
	return row ?? null;
}

function needsApproval(policy: WorkspacePolicy, access: Access, workspaceId: string): boolean {
	if (!policy.review.approvePublic) return false;
	if (policy.review.maintainerBypass && access.can(workspaceId, 'maintainer')) return false;
	return true;
}

/**
 * Publish, or open a review when policy demands one. Also used to push a newer
 * version of an already-public doc onto the wiki under review.mode 'all'.
 */
export async function requestPublish(doc: Doc, access: Access): Promise<PublishOutcome> {
	const policy = await getPolicy(doc.workspaceId);
	const role = access.role(doc.workspaceId);
	if (!canMakePublic(policy, role)) return 'forbidden';

	if (!needsApproval(policy, access, doc.workspaceId)) {
		await publishNow(doc);
		return 'published';
	}

	const existing = await openReview(doc.id, 'publish');
	const versionNo = await latestVersionNo(doc.id);
	if (existing) {
		await db.update(docReviews).set({ versionNo }).where(eq(docReviews.id, existing.id));
	} else {
		await db.insert(docReviews).values({
			docId: doc.id,
			kind: 'publish',
			versionNo,
			requestedBy: access.principal.username,
			quorum: policy.review.quorum
		});
	}
	return 'pending';
}

/** Called after every edit so the wiki snapshot follows policy. */
export async function onDocUpdated(doc: Doc): Promise<void> {
	if (!doc.isPublic) return;
	const policy = await getPolicy(doc.workspaceId);
	if (policy.review.mode !== 'all') {
		await db
			.update(docs)
			.set({ publishedVersionNo: await latestVersionNo(doc.id) })
			.where(eq(docs.id, doc.id));
	}
}

export type VoteOutcome = 'approved' | 'rejected' | 'recorded' | 'forbidden';

export async function voteOnReview(
	reviewId: number,
	verdict: 'approve' | 'reject',
	access: Access
): Promise<VoteOutcome> {
	const [review] = await db.select().from(docReviews).where(eq(docReviews.id, reviewId)).limit(1);
	if (!review || review.state !== 'open') return 'forbidden';
	const [doc] = await db.select().from(docs).where(eq(docs.id, review.docId)).limit(1);
	if (!doc) return 'forbidden';

	const policy = await getPolicy(doc.workspaceId);
	const role = access.role(doc.workspaceId);
	const username = access.principal.username;
	if (!isApprover(policy, role, access.principal.claims)) return 'forbidden';
	if (!policy.review.selfApprove && review.requestedBy === username) return 'forbidden';

	if (verdict === 'reject') {
		await db
			.update(docReviews)
			.set({ state: 'rejected', resolvedBy: username, resolvedAt: new Date() })
			.where(eq(docReviews.id, reviewId));
		return 'rejected';
	}

	await db
		.insert(docReviewVotes)
		.values({ reviewId, username, verdict })
		.onConflictDoNothing();
	const [count] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(docReviewVotes)
		.where(and(eq(docReviewVotes.reviewId, reviewId), eq(docReviewVotes.verdict, 'approve')));

	if ((count?.n ?? 0) >= review.quorum) {
		await publishNow(doc);
		await db
			.update(docReviews)
			.set({ state: 'approved', resolvedBy: username, resolvedAt: new Date() })
			.where(eq(docReviews.id, reviewId));
		return 'approved';
	}
	return 'recorded';
}

/** A reader flag from the wiki: asks the workspace to revisit the doc. */
export async function requestUpdate(docId: string, username: string, note: string): Promise<void> {
	const existing = await openReview(docId, 'update');
	if (existing) return;
	await db.insert(docReviews).values({
		docId,
		kind: 'update',
		requestedBy: username,
		note: note.slice(0, 500)
	});
}

export interface PendingReview {
	id: number;
	kind: string;
	docId: string;
	docTitle: string;
	docSlug: string;
	workspaceId: string;
	requestedBy: string;
	note: string;
	quorum: number;
	approvals: number;
	createdAt: Date;
}

export async function listOpenReviews(workspaceIds?: string[]): Promise<PendingReview[]> {
	const rows = await db
		.select({
			id: docReviews.id,
			kind: docReviews.kind,
			docId: docReviews.docId,
			docTitle: docs.title,
			docSlug: docs.slug,
			workspaceId: docs.workspaceId,
			requestedBy: docReviews.requestedBy,
			note: docReviews.note,
			quorum: docReviews.quorum,
			createdAt: docReviews.createdAt,
			approvals: sql<number>`(SELECT count(*)::int FROM doc_review_votes v WHERE v.review_id = ${docReviews.id} AND v.verdict = 'approve')`
		})
		.from(docReviews)
		.innerJoin(docs, eq(docs.id, docReviews.docId))
		.where(and(eq(docReviews.state, 'open'), isNull(docs.deletedAt)))
		.orderBy(desc(docReviews.createdAt));
	const scoped = workspaceIds ? rows.filter((r) => workspaceIds.includes(r.workspaceId)) : rows;
	return scoped.map((r) => ({ ...r, requestedBy: r.requestedBy ?? '' }));
}

export interface PublishedDoc {
	id: string;
	title: string;
	publicSlug: string;
	workspaceId: string;
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
			publishedVersionNo: docs.publishedVersionNo,
			updatedAt: docs.updatedAt,
			tags: docs.tags
		})
		.from(docs)
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
