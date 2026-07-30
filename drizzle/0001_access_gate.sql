-- Platform login gate: RBAC-style allow rules, and per-user blocks that
-- override everything. No rules at all means everyone authenticated may enter.
CREATE TABLE IF NOT EXISTS access_rules (
	id serial PRIMARY KEY,
	attribute text NOT NULL,
	value text NOT NULL DEFAULT '*',
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_rules_uniq ON access_rules (attribute, value);

CREATE TABLE IF NOT EXISTS blocked_users (
	username text PRIMARY KEY,
	blocked_by text,
	created_at timestamptz NOT NULL DEFAULT now()
);
