-- 001_init.sql — workspaces, role-based bindings, audit log.
--
-- Schema model:
--   workspaces           — one row per team workspace (personal ones are implicit).
--   workspace_bindings   — "anyone matching <source=value> gets <role> on this ws".
--                          Bindings resolve user → role at login; max role wins.
--   audit_log            — append-only record of authz-relevant actions.

CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY
                CHECK (id ~ '^[a-z0-9-]+$'),
    name        TEXT NOT NULL,
    settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ordered enum: role comparison uses the enum order, so admin > editor > viewer
-- falls out naturally from GREATEST() / max() aggregates on bindings.
DO $$ BEGIN
    CREATE TYPE workspace_role AS ENUM ('viewer', 'editor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A binding grants `role` on `workspace_id` to anyone matching `source = source_value`.
-- Sources:
--   'ldap_group'  — value is a full DN (or CN, project's call); matched against user.ldapGroups
--   'oidc_claim'  — value is a "path:value" expression matched against OIDC claims
--   'user'        — value is a username (explicit per-user grant or override)
--   'wildcard'    — value is the literal '*'; matches any authenticated user
CREATE TABLE IF NOT EXISTS workspace_bindings (
    workspace_id  TEXT NOT NULL
                  REFERENCES workspaces(id) ON DELETE CASCADE,
    source        TEXT NOT NULL
                  CHECK (source IN ('ldap_group', 'oidc_claim', 'user', 'wildcard')),
    source_value  TEXT NOT NULL,
    role          workspace_role NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    TEXT,
    PRIMARY KEY (workspace_id, source, source_value)
);

CREATE INDEX IF NOT EXISTS idx_bindings_source
    ON workspace_bindings (source, source_value);

-- Append-only. Actions are free-form strings like 'workspace.create',
-- 'doc.delete', 'binding.add'. Keep `target` small and searchable
-- (workspace id, doc slug); dump the rest in meta.
CREATE TABLE IF NOT EXISTS audit_log (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor   TEXT NOT NULL,
    action  TEXT NOT NULL,
    target  TEXT,
    meta    JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_at
    ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_at
    ON audit_log (actor, at DESC);
