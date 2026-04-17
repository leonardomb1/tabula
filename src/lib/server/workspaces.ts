/**
 * Workspaces — admin-defined teams + auto-created personal spaces.
 *
 * Config lives at `content/workspaces.json`, edited via the R2 console
 * (or `wrangler r2 object put`) — no redeploy needed. Read with a 30s
 * memory cache. Personal workspaces are implicit per logged-in user.
 */
import { getText } from './storage';

export const DEFAULT_WS_ID = 'default';
export const PERSONAL_PREFIX = 'personal-';
const WORKSPACES_KEY = 'content/workspaces.json';
const TTL_MS = 30_000;

export interface TeamWorkspace {
	id: string;
	name: string;
	/** Array of usernames OR the literal "*" meaning everyone authenticated. */
	members: string[] | '*';
}

export interface Workspace {
	id: string;
	name: string;
	kind: 'team' | 'personal';
}

interface CachedConfig {
	teams: TeamWorkspace[];
	loadedAt: number;
}

let cache: CachedConfig | null = null;
let inflight: Promise<CachedConfig> | null = null;

async function loadConfig(): Promise<CachedConfig> {
	const raw = await getText(WORKSPACES_KEY);
	if (raw == null) {
		// First boot — no file in storage. Default to one company-wide team.
		return {
			teams: [{ id: DEFAULT_WS_ID, name: 'Geral', members: '*' }],
			loadedAt: Date.now()
		};
	}
	try {
		const parsed = JSON.parse(raw);
		const list = Array.isArray(parsed?.workspaces) ? parsed.workspaces : [];
		const teams: TeamWorkspace[] = [];
		for (const w of list) {
			if (
				w &&
				typeof w.id === 'string' &&
				/^[a-z0-9-]+$/.test(w.id) &&
				typeof w.name === 'string' &&
				(w.members === '*' || (Array.isArray(w.members) && w.members.every((m: unknown) => typeof m === 'string')))
			) {
				teams.push({ id: w.id, name: w.name, members: w.members });
			}
		}
		return { teams, loadedAt: Date.now() };
	} catch (e) {
		console.error('[workspaces] failed to parse content/workspaces.json:', e);
		// Fail closed for teams; personal workspaces remain available.
		return { teams: [], loadedAt: Date.now() };
	}
}

async function getConfig(): Promise<CachedConfig> {
	if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
	if (inflight) return inflight;
	inflight = loadConfig().then((c) => {
		cache = c;
		inflight = null;
		return c;
	});
	return inflight;
}

/** Force a reload on next access — call after mutating workspaces.json. */
export function invalidateCache(): void {
	cache = null;
}

function personalWsForUser(username: string): Workspace {
	return { id: `${PERSONAL_PREFIX}${username}`, name: 'Pessoal', kind: 'personal' };
}

/** All workspaces the user can see: their personal, plus every team they're a member of. */
export async function listForUser(username: string): Promise<Workspace[]> {
	const { teams } = await getConfig();
	const visible: Workspace[] = [personalWsForUser(username)];
	for (const t of teams) {
		const isMember = t.members === '*' || t.members.includes(username);
		if (isMember) visible.push({ id: t.id, name: t.name, kind: 'team' });
	}
	return visible;
}

/** Look up a single workspace by id, scoped to what `username` can access. */
export async function getForUser(username: string, wsId: string): Promise<Workspace | null> {
	if (wsId.startsWith(PERSONAL_PREFIX)) {
		// A user can only access their own personal workspace.
		return wsId === `${PERSONAL_PREFIX}${username}` ? personalWsForUser(username) : null;
	}
	const { teams } = await getConfig();
	const team = teams.find((t) => t.id === wsId);
	if (!team) return null;
	const isMember = team.members === '*' || team.members.includes(username);
	return isMember ? { id: team.id, name: team.name, kind: 'team' } : null;
}

export async function canAccess(username: string, wsId: string): Promise<boolean> {
	return (await getForUser(username, wsId)) !== null;
}

/** Storage prefix for a workspace's docs/attachments/history. */
export function wsPrefix(wsId: string): string {
	return `content/workspaces/${wsId}/`;
}
