-- Public wiki: stable wiki identity and published snapshot on docs, the review
-- engine the policy spec describes, and daily view counters.
ALTER TABLE docs ADD COLUMN IF NOT EXISTS public_slug text;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS published_version_no integer;
CREATE UNIQUE INDEX IF NOT EXISTS docs_public_slug_uniq ON docs (public_slug) WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS doc_reviews (
	id serial PRIMARY KEY,
	doc_id text NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
	kind text NOT NULL,
	state text NOT NULL DEFAULT 'open',
	version_no integer,
	requested_by text,
	note text NOT NULL DEFAULT '',
	quorum integer NOT NULL DEFAULT 1,
	resolved_by text,
	created_at timestamptz NOT NULL DEFAULT now(),
	resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS doc_reviews_doc_idx ON doc_reviews (doc_id);
CREATE INDEX IF NOT EXISTS doc_reviews_open_idx ON doc_reviews (state) WHERE state = 'open';

CREATE TABLE IF NOT EXISTS doc_review_votes (
	id serial PRIMARY KEY,
	review_id integer NOT NULL REFERENCES doc_reviews(id) ON DELETE CASCADE,
	username text NOT NULL,
	verdict text NOT NULL,
	note text NOT NULL DEFAULT '',
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS doc_review_votes_uniq ON doc_review_votes (review_id, username);

CREATE TABLE IF NOT EXISTS doc_view_daily (
	doc_id text NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
	day date NOT NULL,
	source text NOT NULL,
	count integer NOT NULL DEFAULT 0,
	PRIMARY KEY (doc_id, day, source)
);
