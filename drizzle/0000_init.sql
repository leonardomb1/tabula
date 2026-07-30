-- The whole schema in one idempotent pass: safe on a fresh database and safe to
-- re-run on any database the previous split migrations (0000-0006) produced.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
		CREATE TEXT SEARCH CONFIGURATION public.pt_unaccent (COPY = portuguese);
		ALTER TEXT SEARCH CONFIGURATION public.pt_unaccent
			ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
	END IF;

	IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'en_unaccent') THEN
		CREATE TEXT SEARCH CONFIGURATION public.en_unaccent (COPY = english);
		ALTER TEXT SEARCH CONFIGURATION public.en_unaccent
			ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
	END IF;
END
$$;

DO $$ BEGIN CREATE TYPE "public"."doc_mode" AS ENUM('markdown', 'typst'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."role" AS ENUM('viewer', 'editor', 'maintainer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."version_kind" AS ENUM('edit', 'restore', 'delete'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE OR REPLACE FUNCTION public.tags_tsvector(text[]) RETURNS tsvector
	LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT to_tsvector('public.pt_unaccent'::regconfig, coalesce(array_to_string($1, ' '), '')) $$;

CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"policy" jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- The search column is added further down, where its expression can be upgraded.
CREATE TABLE IF NOT EXISTS "docs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"mode" "doc_mode" DEFAULT 'markdown' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "docs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "doc_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"version_no" integer NOT NULL,
	"kind" "version_kind" DEFAULT 'edit' NOT NULL,
	"source" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"editor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_versions_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "doc_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_doc_id" text NOT NULL,
	"target_slug" text NOT NULL,
	"target_doc_id" text,
	CONSTRAINT "doc_links_source_doc_id_docs_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."docs"("id") ON DELETE cascade,
	CONSTRAINT "doc_links_target_doc_id_docs_id_fk" FOREIGN KEY ("target_doc_id") REFERENCES "public"."docs"("id") ON DELETE set null
);

CREATE TABLE IF NOT EXISTS "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"doc_id" text,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade,
	CONSTRAINT "attachments_doc_id_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."docs"("id") ON DELETE set null
);

CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"username" text NOT NULL,
	"claims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "workspace_bindings" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"attribute" text NOT NULL,
	"value" text DEFAULT '*' NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_bindings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS user_settings (
	username text PRIMARY KEY,
	full_name text,
	display_name text,
	onboarded boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	mail text,
	title text,
	directory_name text,
	claims jsonb NOT NULL DEFAULT '{}'::jsonb,
	is_platform_admin boolean NOT NULL DEFAULT false,
	last_seen_at timestamptz
);

CREATE TABLE IF NOT EXISTS doc_templates (
	id text PRIMARY KEY,
	workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
	slug text NOT NULL,
	name text NOT NULL,
	source text NOT NULL,
	created_by text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Columns the split migrations added later, for databases created before them.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS mail text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS directory_name text;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS claims jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Weighted bilingual FTS. Rebuilt only when missing or on the pre-tags_tsvector
-- expression, so re-runs never rewrite the table.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'docs' AND column_name = 'search'
			AND generation_expression LIKE '%tags_tsvector%'
	) THEN
		DROP INDEX IF EXISTS docs_search_idx;
		ALTER TABLE docs DROP COLUMN IF EXISTS search;
		ALTER TABLE docs ADD COLUMN search tsvector GENERATED ALWAYS AS (
			setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(title, '')), 'A') ||
			setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(title, '')), 'A') ||
			setweight(array_to_tsvector(tags), 'B') ||
			setweight(public.tags_tsvector(tags), 'B') ||
			setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(body_text, '')), 'C') ||
			setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(body_text, '')), 'C')
		) STORED;
	END IF;
END
$$;

CREATE INDEX IF NOT EXISTS docs_search_idx ON docs USING gin (search);
CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_uniq ON api_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens USING btree (username);
CREATE UNIQUE INDEX IF NOT EXISTS attachments_key_uniq ON attachments USING btree (storage_key);
CREATE INDEX IF NOT EXISTS attachments_ws_idx ON attachments USING btree (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS doc_links_uniq ON doc_links USING btree (source_doc_id, target_slug);
CREATE INDEX IF NOT EXISTS doc_links_target_slug_idx ON doc_links USING btree (target_slug);
CREATE INDEX IF NOT EXISTS doc_links_target_doc_idx ON doc_links USING btree (target_doc_id);
CREATE UNIQUE INDEX IF NOT EXISTS doc_versions_uniq ON doc_versions USING btree (doc_id, version_no);
CREATE UNIQUE INDEX IF NOT EXISTS docs_ws_slug_uniq ON docs USING btree (workspace_id, slug);
CREATE INDEX IF NOT EXISTS docs_ws_idx ON docs USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS docs_public_idx ON docs USING btree (is_public);
CREATE INDEX IF NOT EXISTS docs_title_trgm_idx ON docs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS docs_title_unaccent_trgm_idx ON docs USING gin (public.immutable_unaccent(title) gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS ws_binding_uniq ON workspace_bindings USING btree (workspace_id, attribute, value);
CREATE INDEX IF NOT EXISTS ws_binding_ws_idx ON workspace_bindings USING btree (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS doc_templates_ws_slug_uniq ON doc_templates (workspace_id, slug);
CREATE INDEX IF NOT EXISTS doc_templates_ws_idx ON doc_templates (workspace_id);
