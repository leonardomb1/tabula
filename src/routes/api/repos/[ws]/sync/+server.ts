import { json, type RequestHandler } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { getWorkspace } from '$lib/server/workspaces';
import { syncRepoWorkspace, type RepoConfig } from '$lib/server/repo/sync';

/**
 * Sync webhook for a repo mirror — the automation door: point a GitLab push
 * webhook or any cron platform at it. Authenticated by the per-repo shared
 * secret (rotated on /admin/repos), accepted as ?token=, X-Gitlab-Token, or a
 * bearer header. No secret configured = the door does not exist (404).
 *
 * Replies 202 immediately and syncs in the background — webhook callers
 * time out fast and a shallow clone can take a while. `?wait=1` runs inline
 * for callers that want the result (a cron checking for failures).
 */

function presentedToken(request: Request, url: URL): string {
	const bearer = request.headers.get('authorization');
	return (
		url.searchParams.get('token') ??
		request.headers.get('x-gitlab-token') ??
		(bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : '') ??
		''
	);
}

function tokenMatches(presented: string, secret: string): boolean {
	const a = Buffer.from(presented);
	const b = Buffer.from(secret);
	return a.length === b.length && timingSafeEqual(a, b);
}

const handle: RequestHandler = async ({ params, request, url }) => {
	const ws = await getWorkspace(params.ws ?? '');
	const secret = (ws?.repo as RepoConfig | null)?.webhookSecret;
	if (!ws || ws.kind !== 'repo' || !secret) return json({ error: 'not found' }, { status: 404 });
	if (!tokenMatches(presentedToken(request, url), secret)) {
		return json({ error: 'invalid token' }, { status: 403 });
	}

	if (url.searchParams.get('wait') === '1') {
		try {
			return json(await syncRepoWorkspace(ws.id));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'sync failed';
			// "already running" is a fine outcome for overlapping pushes.
			if (message.includes('already running')) return json({ started: false, running: true }, { status: 202 });
			return json({ error: message }, { status: 422 });
		}
	}

	void syncRepoWorkspace(ws.id).catch((err) =>
		console.warn(`repo webhook sync failed (${ws.id}):`, err instanceof Error ? err.message : err)
	);
	return json({ started: true }, { status: 202 });
};

export const POST = handle;
export const GET = handle;
