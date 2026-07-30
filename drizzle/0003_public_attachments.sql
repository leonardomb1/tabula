-- Anonymous wiki serving: attachments referenced by a published doc carry a
-- denormalized flag, replacing the per-request LIKE scan. Backfilled from the
-- live public docs that exist at migration time.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS attachments_public_idx ON attachments (is_public);

UPDATE attachments a
SET is_public = EXISTS (
	SELECT 1 FROM docs d
	WHERE d.workspace_id = a.workspace_id
	  AND d.is_public = true
	  AND d.deleted_at IS NULL
	  AND d.source LIKE '%/api/attachments/' || a.id || '%'
);
