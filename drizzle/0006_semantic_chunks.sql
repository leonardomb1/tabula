-- Semantic retrieval: one embedded chunk per slice of a document, maintained by
-- the background indexer ($lib/server/semantic) and searched by hybrid
-- searchDocs. The image is pgvector/pgvector, so the extension is available.
--
-- The dimension is fixed by the embedding model (text-embedding-3-small: 1536).
-- Moving to a model with a different dimension is a schema change on purpose —
-- vectors from different spaces must never share an index. `model` tags each
-- row so a same-dimension swap simply re-embeds through the indexer.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS doc_chunks (
	id bigserial PRIMARY KEY,
	doc_id text NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
	seq integer NOT NULL,
	-- docs.rev at embed time: the staleness check. A doc whose rev moved past
	-- its chunks is re-embedded by the indexer.
	rev integer NOT NULL,
	model text NOT NULL,
	content text NOT NULL,
	embedding vector(1536) NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT doc_chunks_doc_seq_uniq UNIQUE (doc_id, seq)
);

CREATE INDEX IF NOT EXISTS doc_chunks_doc_idx ON doc_chunks (doc_id);

-- Cosine HNSW: milliseconds at any corpus size this schema will ever hold.
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
	ON doc_chunks USING hnsw (embedding vector_cosine_ops);
