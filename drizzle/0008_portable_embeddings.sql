-- Portable embeddings: one nullable vector column per supported dimension, so
-- switching embedding providers is an env change, never a schema change.
-- pgvector welds the dimension into the column type; rather than forcing every
-- model through one truncated size, each row populates exactly the column
-- matching its model's native output. The `model` tag (0006) already gates
-- both search and the indexer's staleness predicate, so vector spaces can
-- never mix regardless of column layout.
--
-- 768/1024/1536/2048/3072 covers every mainstream API today (Voyage, OpenAI,
-- Cohere, Mistral, Gemini, Jina, the Ollama/local families). A future
-- off-list dimension is one additive migration.
--
-- HNSW indexes cap at 2000 dimensions for the plain vector type, so the
-- 2048/3072 columns are halfvec (fp16, indexable to 4000 dims, negligible
-- cosine loss; pgvector >= 0.7 — the pgvector/pgvector image ships it).
--
-- The existing 1536 column is RENAMED, not rebuilt — current Azure
-- (text-embedding-3-small) vectors survive untouched, and its HNSW index
-- follows the rename automatically.

ALTER TABLE doc_chunks RENAME COLUMN embedding TO embedding_1536;
ALTER TABLE doc_chunks ALTER COLUMN embedding_1536 DROP NOT NULL;
ALTER INDEX doc_chunks_embedding_idx RENAME TO doc_chunks_embedding_1536_idx;

ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS embedding_768 vector(768);
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS embedding_1024 vector(1024);
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS embedding_2048 halfvec(2048);
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS embedding_3072 halfvec(3072);

-- A chunk always carries exactly one embedding — the NOT NULL the single
-- column used to provide, generalized.
ALTER TABLE doc_chunks ADD CONSTRAINT doc_chunks_one_embedding CHECK (
	num_nonnulls(embedding_768, embedding_1024, embedding_1536, embedding_2048, embedding_3072) = 1
);

-- Partial HNSW per dimension: skeletal while a column is unused, real only
-- for the active model's space.
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_768_idx
	ON doc_chunks USING hnsw (embedding_768 vector_cosine_ops)
	WHERE embedding_768 IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_1024_idx
	ON doc_chunks USING hnsw (embedding_1024 vector_cosine_ops)
	WHERE embedding_1024 IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_2048_idx
	ON doc_chunks USING hnsw (embedding_2048 halfvec_cosine_ops)
	WHERE embedding_2048 IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_chunks_embedding_3072_idx
	ON doc_chunks USING hnsw (embedding_3072 halfvec_cosine_ops)
	WHERE embedding_3072 IS NOT NULL;
