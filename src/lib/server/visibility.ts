import { sql, type SQL } from 'drizzle-orm';
import { docs } from './db/schema';

/**
 * What counts as a document for every read path: not soft-deleted, and not an
 * ephemeral agent draft.
 *
 * This exists as ONE definition on purpose. Drafts leak through anything that
 * queries `docs` and forgets about them — full-text search, the fuzzy title
 * fallback, workspace listings, tag counts, backlinks, wiki-link resolution —
 * and a convention every future query has to remember is a convention that
 * eventually gets forgotten. Import this instead of rewriting the predicate.
 *
 * Reaching a draft on purpose means going through $lib/server/drafts, or asking
 * for one by id via getDoc().
 */
export const visibleDocs: SQL = sql`${docs.deletedAt} is null and ${docs.ephemeral} = false`;

/** The complement: live drafts only, for the drafts tray and the TTL sweep. */
export const draftDocs: SQL = sql`${docs.deletedAt} is null and ${docs.ephemeral}`;
