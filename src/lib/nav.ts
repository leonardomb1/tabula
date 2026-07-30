import { resolve } from '$app/paths';

export function docHref(workspaceId: string, slug: string): string {
	return resolve('/(app)/w/[ws]/[slug]', { ws: workspaceId, slug });
}

export function workspaceHref(
	workspaceId: string,
	opts: { tags?: string[]; sort?: string; limit?: number } = {}
): string {
	const params = new URLSearchParams();
	if (opts.tags?.length) params.set('tags', opts.tags.join(','));
	if (opts.sort && opts.sort !== 'recent') params.set('sort', opts.sort);
	if (opts.limit) params.set('limit', String(opts.limit));
	const qs = params.toString();
	return resolve('/(app)/w/[ws]', { ws: workspaceId }) + (qs ? `?${qs}` : '');
}

export function templatesHref(workspaceId: string): string {
	return resolve('/(app)/w/[ws]/templates', { ws: workspaceId });
}

export function newDocHref(workspaceId: string): string {
	return resolve('/(app)/w/[ws]/new', { ws: workspaceId });
}

export function editHref(workspaceId: string, slug: string): string {
	return resolve('/(app)/w/[ws]/[slug]/edit', { ws: workspaceId, slug });
}

export function historyHref(workspaceId: string, slug: string): string {
	return resolve('/(app)/w/[ws]/[slug]/history', { ws: workspaceId, slug });
}

export function toggleTag(active: string[], tag: string): string[] {
	return active.includes(tag) ? active.filter((t) => t !== tag) : [...active, tag];
}

export function homeHref(): string {
	return resolve('/(app)');
}

export function adminHref(section?: string, workspaceId?: string): string {
	const params = new URLSearchParams();
	if (workspaceId) params.set('ws', workspaceId);
	if (section) params.set('section', section);
	const qs = params.toString();
	return resolve('/(app)/admin') + (qs ? `?${qs}` : '');
}

export function loginHref(redirectTo?: string): string {
	const base = resolve('/login');
	return redirectTo ? `${base}?redirectTo=${encodeURIComponent(redirectTo)}` : base;
}
