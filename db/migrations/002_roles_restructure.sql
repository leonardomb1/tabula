-- 002_roles_restructure.sql — rename per-workspace 'admin' → 'maintainer'.
--
-- Rationale: 'admin' now exclusively denotes platform super-users (a
-- session-level attribute sourced from LDAP/OIDC groups, not a binding).
-- Per-workspace roles are viewer < editor < maintainer, where maintainer
-- can manage the workspace (rename, delete, edit bindings).
--
-- Postgres doesn't allow dropping enum values, so we rename-and-swap:
-- create a fresh enum, cast existing rows over, drop the old type.

ALTER TYPE workspace_role RENAME TO workspace_role_v1;

CREATE TYPE workspace_role AS ENUM ('viewer', 'editor', 'maintainer');

ALTER TABLE workspace_bindings
    ALTER COLUMN role TYPE workspace_role
    USING (
        CASE role::text
            WHEN 'admin' THEN 'maintainer'
            ELSE role::text
        END::workspace_role
    );

DROP TYPE workspace_role_v1;
