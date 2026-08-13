-- An attribute is now the ID token claim name it matches, so the AD-era key
-- `ad_group` becomes `groups` — what OIDC calls the same thing. Values are left
-- alone: whether they still match is a directory question, not a schema one, and
-- scripts/binding-drift.ts is what answers it.
--
-- No conflict handling needed against the (workspace_id, attribute, value) and
-- (attribute, value) unique indexes: nothing could have written `groups` before
-- this migration, and the runner applies each file once.

UPDATE workspace_bindings SET attribute = 'groups' WHERE attribute = 'ad_group';
UPDATE workspace_bindings SET attribute = 'groups_prefix' WHERE attribute = 'ad_group_prefix';

UPDATE access_rules SET attribute = 'groups' WHERE attribute = 'ad_group';
UPDATE access_rules SET attribute = 'groups_prefix' WHERE attribute = 'ad_group_prefix';

-- Snapshots are rebuilt on each sign-in, but renaming the key keeps the binding
-- editor from offering a stale `ad_group` option until everyone has signed in.
UPDATE user_settings
SET claims = (claims - 'ad_group') || jsonb_build_object('groups', claims -> 'ad_group')
WHERE claims ? 'ad_group';

UPDATE api_tokens
SET claims = (claims - 'ad_group') || jsonb_build_object('groups', claims -> 'ad_group')
WHERE claims ? 'ad_group';
