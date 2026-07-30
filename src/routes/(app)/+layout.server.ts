import { redirect } from '@sveltejs/kit';
import { listWorkspaces } from '$lib/server/workspaces';
import { listDocsPage, listTagCounts } from '$lib/server/docsQuery';
import { personalWorkspaceId } from '$lib/server/ids';
import { getUserSettings, preferredName } from '$lib/server/userSettings';
import type { LayoutServerLoad } from './$types';

const WS_COOKIE = 'tabula_ws';
const WS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user || !locals.access) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}
	const { user, access } = locals;

	const workspaces = (await listWorkspaces())
		.filter((w) => access.can(w.id))
		.map((w) => ({ id: w.id, name: w.name, kind: w.kind, role: access.role(w.id) }))
		.sort((a, b) => a.name.localeCompare(b.name));

	const fromPath = url.pathname.match(/^\/w\/([^/]+)/)?.[1];
	const requested = fromPath ? decodeURIComponent(fromPath) : cookies.get(WS_COOKIE);
	const current =
		workspaces.find((w) => w.id === requested) ??
		workspaces.find((w) => w.id === personalWorkspaceId(user.username)) ??
		workspaces[0] ??
		null;

	if (current && cookies.get(WS_COOKIE) !== current.id) {
		cookies.set(WS_COOKIE, current.id, {
			path: '/',
			sameSite: 'lax',
			maxAge: WS_COOKIE_MAX_AGE
		});
	}

	const [recent, tagCounts, settings] = await Promise.all([
		current ? listDocsPage(current.id, { limit: 8 }) : null,
		current ? listTagCounts(current.id) : [],
		getUserSettings(user.username)
	]);

	return {
		user: {
			username: user.username,
			displayName: preferredName(settings, user.displayName, user.username),
			isPlatformAdmin: user.isPlatformAdmin,
			jobTitle: user.title ?? '',
			crown: user.isPlatformAdmin
				? ('gold' as const)
				: workspaces.some((w) => w.role === 'maintainer' && w.kind !== 'personal')
					? ('silver' as const)
					: null,
			canAdmin:
				user.isPlatformAdmin ||
				workspaces.some((w) => w.role === 'maintainer' && w.kind !== 'personal')
		},
		profile: {
			fullName: settings?.fullName ?? '',
			displayName: settings?.displayName ?? '',
			onboarded: settings?.onboarded ?? false
		},
		workspaces,
		current,
		canWrite: current ? access.can(current.id, 'editor') : false,
		recent: recent?.docs.map((d) => ({ id: d.id, slug: d.slug, title: d.title })) ?? [],
		total: recent?.total ?? 0,
		tagCounts
	};
};
