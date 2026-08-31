-- Repo mirror workspaces: git sync configuration lives on the workspace row.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS repo jsonb;
