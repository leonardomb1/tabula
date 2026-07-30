import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { attachments, type Attachment } from './db/schema';
import { newDocId } from './ids';

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
