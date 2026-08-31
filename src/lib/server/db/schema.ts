import { sql } from 'drizzle-orm';
import {
	pgTable,
	pgEnum,
	date,
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

/** pgvector column. The dimension is part of the type — see 0006_semantic_chunks. */
const vector1536 = customType<{ data: string }>({
	dataType() {
		return 'vector(1536)';
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
	/** Git mirror configuration; non-null marks a repo workspace (kind 'repo'). */
	repo: jsonb('repo'),
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
 *
 * `ephemeral` marks an agent draft: disposable, high-churn, swept on a TTL, and
 * deliberately invisible to search, listings, backlinks and version history until
 * a human promotes it (see $lib/server/drafts). Drafts trade unbounded history for
 * a single rolling `prevSource` — one level of undo at constant storage — because
 * an agent that mangles a patch must recover without re-emitting the document.
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
		publicSlug: text('public_slug'),
		publishedVersionNo: integer('published_version_no'),
		frontmatter: jsonb('frontmatter').notNull().default(sql`'{}'::jsonb`),

		ephemeral: boolean('ephemeral').notNull().default(false),
		/** Previous source of an ephemeral draft: the one undo step. Null otherwise. */
		prevSource: text('prev_source'),
		/** Provenance of a draft, e.g. 'perguntai'. Display only — never load-bearing. */
		origin: text('origin'),
		/**
		 * Monotonic write counter, the concurrency token for patch edits. Versions
		 * cannot serve that role: drafts have no version rows by design, and a patch
		 * applied against a stale source must be rejected rather than merged blind.
		 */
		rev: integer('rev').notNull().default(0),

		createdBy: text('created_by'),
		updatedBy: text('updated_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true }),

		/**
		 * Drafts generate an EMPTY tsvector, so they hold no GIN entry at all. The
		 * shared visibility predicate ($lib/server/visibility) is what guarantees
		 * drafts stay out of results; this makes a future query that forgets it
		 * unable to match one on full-text anyway.
		 */
		search: tsvector('search').generatedAlwaysAs(
			sql`case when ephemeral then ''::tsvector else setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(title, '')), 'A') || setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(title, '')), 'A') || setweight(array_to_tsvector(tags), 'B') || setweight(public.tags_tsvector(tags), 'B') || setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(body_text, '')), 'C') || setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(body_text, '')), 'C') end`
		)
	},
	(t) => [
		uniqueIndex('docs_ws_slug_uniq').on(t.workspaceId, t.slug),
		index('docs_ws_idx').on(t.workspaceId),
		index('docs_public_idx').on(t.isPublic),
		// Partial: keeps draft churn out of the indexes. A size and speed lever only
		// — Postgres can still reach a draft row by seq scan, which is why the
		// visibility predicate carries the correctness guarantee.
		index('docs_search_idx')
			.using('gin', t.search)
			.where(sql`ephemeral = false`),
		index('docs_title_trgm_idx')
			.using('gin', sql`${t.title} gin_trgm_ops`)
			.where(sql`ephemeral = false`),
		/** Drives the TTL sweep, which only ever scans drafts. */
		index('docs_draft_sweep_idx')
			.on(t.updatedAt)
			.where(sql`ephemeral`)
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
		isPublic: boolean('is_public').notNull().default(false),
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
 * sign-in. Identity still comes from the IdP on every login; this is only so the app
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
	claims: jsonb('claims').$type<Record<string, string[]>>().notNull().default(sql`'{}'::jsonb`),
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
		claims: jsonb('claims').$type<Record<string, string[]>>().notNull().default(sql`'{}'::jsonb`),
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

export const docReviews = pgTable(
	'doc_reviews',
	{
		id: serial('id').primaryKey(),
		docId: text('doc_id')
			.notNull()
			.references(() => docs.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		state: text('state').notNull().default('open'),
		versionNo: integer('version_no'),
		requestedBy: text('requested_by'),
		note: text('note').notNull().default(''),
		quorum: integer('quorum').notNull().default(1),
		resolvedBy: text('resolved_by'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		resolvedAt: timestamp('resolved_at', { withTimezone: true })
	},
	(t) => [index('doc_reviews_doc_idx').on(t.docId)]
);

export const docReviewVotes = pgTable(
	'doc_review_votes',
	{
		id: serial('id').primaryKey(),
		reviewId: integer('review_id')
			.notNull()
			.references(() => docReviews.id, { onDelete: 'cascade' }),
		username: text('username').notNull(),
		verdict: text('verdict').notNull(),
		note: text('note').notNull().default(''),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [uniqueIndex('doc_review_votes_uniq').on(t.reviewId, t.username)]
);

export const docViewDaily = pgTable(
	'doc_view_daily',
	{
		docId: text('doc_id')
			.notNull()
			.references(() => docs.id, { onDelete: 'cascade' }),
		day: date('day').notNull(),
		source: text('source').notNull(),
		count: integer('count').notNull().default(0)
	},
	(t) => [uniqueIndex('doc_view_daily_pk').on(t.docId, t.day, t.source)]
);

/**
 * Embedded slices of a document, maintained by the background indexer
 * ($lib/server/semantic) — never written on the request path. `rev` records the
 * doc revision the chunks were cut from, which is the whole staleness protocol:
 * chunks whose rev trails their doc's get replaced on the next indexer tick.
 */
export const docChunks = pgTable(
	'doc_chunks',
	{
		id: serial('id').primaryKey(),
		docId: text('doc_id')
			.notNull()
			.references(() => docs.id, { onDelete: 'cascade' }),
		seq: integer('seq').notNull(),
		rev: integer('rev').notNull(),
		model: text('model').notNull(),
		content: text('content').notNull(),
		embedding: vector1536('embedding').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(t) => [
		uniqueIndex('doc_chunks_doc_seq_uniq').on(t.docId, t.seq),
		index('doc_chunks_doc_idx').on(t.docId)
		// The HNSW index exists in SQL only (0006): drizzle has no hnsw builder.
	]
);

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
export type DocReview = typeof docReviews.$inferSelect;
export type DocReviewVote = typeof docReviewVotes.$inferSelect;
export type DocChunk = typeof docChunks.$inferSelect;
