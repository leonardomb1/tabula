-- Ephemeral agent drafts: disposable documents an agent authors and patches in
-- place, so only the diff crosses the wire instead of the whole source on every
-- revision. Drafts are swept on a TTL and stay out of search, listings,
-- backlinks and version history until a human promotes them.
--
-- `rev` is the concurrency token for patch edits. Versions cannot serve that
-- role: drafts deliberately record none, and a patch computed from a stale
-- source must be rejected rather than merged blind.
--
-- Existing rows all default to ephemeral = false, so the regenerated `search`
-- column recomputes to exactly what it held before. No backfill needed.
ALTER TABLE docs ADD COLUMN IF NOT EXISTS ephemeral boolean NOT NULL DEFAULT false;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS prev_source text;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 0;

-- The generated expression now references `ephemeral`, so the column has to be
-- rebuilt — and rebuilt AFTER the column it reads. Dropping `search` takes
-- docs_search_idx with it; the trigram index is on `title` and must go
-- explicitly so it can come back partial.
DROP INDEX IF EXISTS docs_search_idx;
DROP INDEX IF EXISTS docs_title_trgm_idx;
DROP INDEX IF EXISTS docs_title_unaccent_trgm_idx;
ALTER TABLE docs DROP COLUMN IF EXISTS search;

-- A draft generates an EMPTY tsvector, so it holds no GIN entry at all. The
-- shared visibility predicate ($lib/server/visibility) is what guarantees drafts
-- stay out of results; this makes a query that forgets it unable to match one on
-- full-text anyway.
ALTER TABLE docs ADD COLUMN search tsvector GENERATED ALWAYS AS (
	CASE WHEN ephemeral THEN ''::tsvector ELSE
		setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(title, '')), 'A') ||
		setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(title, '')), 'A') ||
		setweight(array_to_tsvector(tags), 'B') ||
		setweight(public.tags_tsvector(tags), 'B') ||
		setweight(to_tsvector('public.pt_unaccent'::regconfig, coalesce(body_text, '')), 'C') ||
		setweight(to_tsvector('public.en_unaccent'::regconfig, coalesce(body_text, '')), 'C')
	END
) STORED;

-- Partial: keeps draft churn out of the indexes. A size and speed lever only —
-- Postgres can still reach a draft row by seq scan, which is why the visibility
-- predicate carries the correctness guarantee.
CREATE INDEX IF NOT EXISTS docs_search_idx ON docs USING gin (search) WHERE ephemeral = false;
CREATE INDEX IF NOT EXISTS docs_title_trgm_idx ON docs USING gin (title gin_trgm_ops) WHERE ephemeral = false;
-- Lives only in 0000_init, not in schema.ts, so Drizzle never sees it — but this
-- is the index the fuzzy title fallback in searchDocs actually uses.
CREATE INDEX IF NOT EXISTS docs_title_unaccent_trgm_idx
	ON docs USING gin (public.immutable_unaccent(title) gin_trgm_ops) WHERE ephemeral = false;

-- Drives the TTL sweep, which only ever scans drafts.
CREATE INDEX IF NOT EXISTS docs_draft_sweep_idx ON docs (updated_at) WHERE ephemeral;
