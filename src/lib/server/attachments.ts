import { and, desc, eq, isNull, like } from 'drizzle-orm';
import { db } from './db';
import { attachments, docs, type Attachment } from './db/schema';
import { newDocId } from './ids';
import { storage } from './storage';

export function attachmentUrl(id: string): string {
	return `/api/attachments/${id}`;
}

function safeFilename(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? 'file';
	const cleaned = base.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 120);
	return cleaned || 'file';
}

/** Store the bytes via the storage backend and record the attachment. */
export async function createAttachment(input: {
	workspaceId: string;
	docId?: string;
	filename: string;
	contentType: string;
	data: Uint8Array;
	actor: string;
}): Promise<Attachment> {
	const id = newDocId();
	const filename = safeFilename(input.filename);
	const storageKey = `attachments/${id}/${filename}`;
	await storage().write(storageKey, input.data, { contentType: input.contentType });
	const [row] = await db
		.insert(attachments)
		.values({
			id,
			workspaceId: input.workspaceId,
			docId: input.docId ?? null,
			storageKey,
			filename,
			contentType: input.contentType,
			size: input.data.byteLength,
			createdBy: input.actor
		})
		.returning();
	return row;
}

export async function getAttachment(id: string): Promise<Attachment | null> {
	const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
	return row ?? null;
}

/** True when a live public doc in the attachment's workspace references it. */
export async function referencedByPublicDoc(a: Attachment): Promise<boolean> {
	const [row] = await db
		.select({ id: docs.id })
		.from(docs)
		.where(
			and(
				eq(docs.workspaceId, a.workspaceId),
				eq(docs.isPublic, true),
				isNull(docs.deletedAt),
				like(docs.source, `%${attachmentUrl(a.id)}%`)
			)
		)
		.limit(1);
	return !!row;
}

export interface RecordAttachmentInput {
	workspaceId: string;
	docId?: string;
	storageKey: string;
	filename: string;
	contentType: string;
	size: number;
	actor: string;
}

export async function recordAttachment(input: RecordAttachmentInput): Promise<Attachment> {
	const [row] = await db
		.insert(attachments)
		.values({
			id: newDocId(),
			workspaceId: input.workspaceId,
			docId: input.docId ?? null,
			storageKey: input.storageKey,
			filename: input.filename,
			contentType: input.contentType,
			size: input.size,
			createdBy: input.actor
		})
		.returning();
	return row;
}

export async function getAttachmentByKey(storageKey: string): Promise<Attachment | null> {
	const [row] = await db
		.select()
		.from(attachments)
		.where(eq(attachments.storageKey, storageKey))
		.limit(1);
	return row ?? null;
}

export async function listAttachments(workspaceId: string): Promise<Attachment[]> {
	return db
		.select()
		.from(attachments)
		.where(eq(attachments.workspaceId, workspaceId))
		.orderBy(desc(attachments.createdAt));
}

export async function removeAttachment(id: string): Promise<Attachment | null> {
	const [row] = await db.delete(attachments).where(eq(attachments.id, id)).returning();
	return row ?? null;
}
