import { sql } from 'drizzle-orm';
import {
	pgTable,
	pgEnum,
	text,
	integer,
	boolean,
	timestamp,
	jsonb,
	serial,
	customType,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/** Postgres tsvector; Drizzle has no native column type for it. */
const tsvector = customType<{ data: string }>({
	dataType() {
		return 'tsvector';
	}
});

export const roleEnum = pgEnum('role', ['viewer', 'editor', 'maintainer']);
export const docModeEnum = pgEnum('doc_mode', ['markdown', 'typst']);
export const versionKindEnum = pgEnum('version_kind', ['edit', 'restore', 'delete']);

/** A workspace: a name, a kind, and its internal policy (see $lib/policy). */
export const workspaces = pgTable('workspaces', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	kind: text('kind').notNull().default('team'),
	policy: jsonb('policy').notNull().default(sql`'{}'::jsonb`),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

/**
 * Attribute-based membership: which directory attribute to match, on what value,
 * and the role it grants. `attribute` is open text so new attributes need no
 * migration; a `<attr>_prefix` variant matches the start of a claim value.
 */
export const workspaceBindings = pgTable(
	'workspace_bindings',
	{
		id: serial('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		attribute: text('attribute').notNull(),
		value: text('value').notNull().default('*'),
		role: roleEnum('role').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('ws_binding_uniq').on(t.workspaceId, t.attribute, t.value),
		index('ws_binding_ws_idx').on(t.workspaceId)
	]
);

/**
 * A document. Postgres is the source of truth for text; object storage holds only
 * binaries. `search` is a stored generated tsvector, so Postgres maintains the index
 * on every write with no trigger to keep in sync. Deletion is soft.
 */
export const docs = pgTable(
	'docs',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		title: text('title').notNull().default(''),
		mode: docModeEnum('mode').notNull().default('markdown'),

		source: text('source').notNull().default(''),
		bodyText: text('body_text').notNull().default(''),
		tags: text('tags').array().notNull().default(sql`'{}'::text[]`),

		isPublic: boolean('is_public').notNull().default(false),
		frontmatter: jsonb('frontmatter').notNull().default(sql`'{}'::jsonb`),

		createdBy: text('created_by'),
		updatedBy: text('updated_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),

		search: tsvector('search').generatedAlwaysAs(
			sql`setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(title, '')), 'A') || setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(title, '')), 'A') || setweight(array_to_tsvector(tags), 'B') || setweight(public.tags_tsvector(tags), 'B') || setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(body_text, '')), 'C') || setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(body_text, '')), 'C')`
		)
	},
	(t) => [
		uniqueIndex('docs_ws_slug_uniq').on(t.workspaceId, t.slug),
		index('docs_ws_idx').on(t.workspaceId),
		index('docs_public_idx').on(t.isPublic),
		index('docs_search_idx').using('gin', t.search),
		index('docs_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`)
	]
);

/** Full source snapshot per version, which is what makes restore and history cheap. */
export const docVersions = pgTable(
	'doc_versions',
	{
		id: serial('id').primaryKey(),
		docId: text('doc_id')
			.notNull()
			.references(() => docs.id, { onDelete: 'cascade' }),
		versionNo: integer('version_no').notNull(),
		kind: versionKindEnum('kind').notNull().default('edit'),
		source: text('source').notNull(),
		title: text('title').notNull().default(''),
		editor: text('editor'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('doc_versions_uniq').on(t.docId, t.versionNo)]
);

/** Wiki-link edges, powering backlinks and dead-link detection. */
export const docLinks = pgTable(
	'doc_links',
	{
		id: serial('id').primaryKey(),
		sourceDocId: text('source_doc_id')
			.notNull()
			.references(() => docs.id, { onDelete: 'cascade' }),
		targetSlug: text('target_slug').notNull(),
		targetDocId: text('target_doc_id').references(() => docs.id, { onDelete: 'set null' })
	},
	(t) => [
		uniqueIndex('doc_links_uniq').on(t.sourceDocId, t.targetSlug),
		index('doc_links_target_slug_idx').on(t.targetSlug),
		index('doc_links_target_doc_idx').on(t.targetDocId)
	]
);

/** Row gating access to a binary; the bytes themselves live in object storage. */
export const attachments = pgTable(
	'attachments',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		docId: text('doc_id').references(() => docs.id, { onDelete: 'set null' }),
		storageKey: text('storage_key').notNull(),
		filename: text('filename').notNull(),
		contentType: text('content_type').notNull(),
		size: integer('size').notNull().default(0),
		createdBy: text('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('attachments_key_uniq').on(t.storageKey),
		index('attachments_ws_idx').on(t.workspaceId)
	]
);

/** A Typst document that wraps a doc at export time. The template owns the page. */
export const docTemplates = pgTable(
	'doc_templates',
	{
		id: text('id').primaryKey(),
		workspaceId: text('workspace_id')
			.notNull()
			.references(() => workspaces.id, { onDelete: 'cascade' }),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		source: text('source').notNull(),
		createdBy: text('created_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('doc_templates_ws_slug_uniq').on(t.workspaceId, t.slug),
		index('doc_templates_ws_idx').on(t.workspaceId)
	]
);

/**
 * What someone chose to be called, plus the directory snapshot from their last
 * sign-in. Identity still comes from k-auth on every login; this is only so the app
 * can describe other people.
 */
export const userSettings = pgTable('user_settings', {
	username: text('username').primaryKey(),
	fullName: text('full_name'),
	displayName: text('display_name'),
	onboarded: boolean('onboarded').notNull().default(false),

	mail: text('mail'),
	title: text('title'),
	directoryName: text('directory_name'),
	claims: jsonb('claims').notNull().default(sql`'{}'::jsonb`),
	isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
	lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

/** Bearer tokens for the MCP server. Only a sha256 of the token is stored. */
export const apiTokens = pgTable(
	'api_tokens',
	{
		id: text('id').primaryKey(),
		tokenHash: text('token_hash').notNull(),
		username: text('username').notNull(),
		claims: jsonb('claims').notNull().default(sql`'{}'::jsonb`),
		isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
		label: text('label').notNull().default(''),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true })
	},
	(t) => [
		uniqueIndex('api_tokens_hash_uniq').on(t.tokenHash),
		index('api_tokens_user_idx').on(t.username)
	]
);

export const accessRules = pgTable(
	'access_rules',
	{
		id: serial('id').primaryKey(),
		attribute: text('attribute').notNull(),
		value: text('value').notNull().default('*'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('access_rules_uniq').on(t.attribute, t.value)]
);

export const blockedUsers = pgTable('blocked_users', {
	username: text('username').primaryKey(),
	blockedBy: text('blocked_by'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceBinding = typeof workspaceBindings.$inferSelect;
export type Doc = typeof docs.$inferSelect;
export type NewDoc = typeof docs.$inferInsert;
export type DocVersion = typeof docVersions.$inferSelect;
export type DocLink = typeof docLinks.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type DocTemplate = typeof docTemplates.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type AccessRule = typeof accessRules.$inferSelect;
export type BlockedUser = typeof blockedUsers.$inferSelect;
