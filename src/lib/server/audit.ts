/**
 * Audit log writer. Every authz-relevant write goes through this. Kept
 * intentionally small — `action` is a free-form dotted string (e.g.
 * 'workspace.create', 'binding.add'), `target` is small and searchable
 * (workspace id, slug), and anything richer lives in the `meta` jsonb.
 *
 * Fire-and-forget from the caller's perspective: failures are logged
 * but never surface to the user. The write path isn't gated on the
 * audit row's success because losing a log row is strictly better than
 * losing a user action.
 */
import { sql } from './db';

export async function audit(params: {
	actor: string;
	action: string;
	target?: string | null;
	meta?: Record<string, unknown>;
}): Promise<void> {
	try {
		await sql`
			INSERT INTO audit_log (actor, action, target, meta)
			VALUES (
				${params.actor},
				${params.action},
				${params.target ?? null},
				${params.meta ?? {}}
			)
		`;
	} catch (e) {
		console.error('[audit] failed to log', params.action, e);
	}
}
