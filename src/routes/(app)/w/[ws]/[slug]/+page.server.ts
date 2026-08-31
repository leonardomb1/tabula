import { error, fail } from '@sveltejs/kit';
import { getDocBySlug, resolveDocRefs } from '$lib/server/docs';
import { renderMarkdown } from '$lib/server/markdown';
import { getOrCompileSvg, TypstCompileError } from '$lib/server/typst';
import { listTemplates, parseTemplateMeta } from '$lib/server/templates';
import { getPeople, unknownPerson } from '$lib/server/people';
import { getPolicy } from '$lib/server/workspaces';
import {
	openPublishRequest,
	requestPublish,
	unpublish,
	approvePublish,
	rejectPublish
} from '$lib/server/publication';
import { requireUser } from '$lib/server/apiGuards';
import { canMakePublic, canApprovePublish } from '$lib/policy';
import type { Person } from '$lib/people';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const doc = await getDocBySlug(params.ws, params.slug);
	if (!doc) error(404);
	if (!doc.isPublic && !locals.access?.can(params.ws)) error(403);

	let html = '';
	let renderError: string | null = null;
	try {
		if (doc.mode === 'markdown') {
			const rendered = await renderMarkdown(doc.source, {
				workspaceId: params.ws,
				resolveRefs: resolveDocRefs
			});
			html = rendered.html;
		} else {
			html = (await getOrCompileSvg(doc.source)).svg;
		}
	} catch (err) {
		renderError = err instanceof TypstCompileError ? err.message : 'render failed';
	}

	const [templates, people, pending] = await Promise.all([
		listTemplates(params.ws),
		doc.updatedBy && locals.user
			? getPeople([doc.updatedBy], params.ws)
			: Promise.resolve({} as Record<string, Person>),
		openPublishRequest(doc.id)
	]);

	// Publication controls: who can publish/unpublish here, and who can approve.
	const role = locals.access?.role(params.ws) ?? null;
	const policy = locals.access ? await getPolicy(params.ws) : null;
	const canPublish = policy ? canMakePublic(policy, role) : false;
	const canApprove = !!pending && canApprovePublish(role);

	return {
		pendingPublish: pending ? { requestedBy: pending.requestedBy ?? '', canApprove } : null,
		canPublish,
		canWrite: locals.access?.can(params.ws, 'editor') ?? false,
		templates: templates.map((t) => ({
			slug: t.slug,
			name: t.name,
			...parseTemplateMeta(t.source)
		})),
		defaultTemplate:
			typeof (doc.frontmatter as Record<string, unknown>)?.template === 'string'
				? ((doc.frontmatter as Record<string, string>).template ?? '')
				: '',
		doc: {
			id: doc.id,
			slug: doc.slug,
			title: doc.title,
			mode: doc.mode,
			tags: doc.tags,
			isPublic: doc.isPublic,
			publicSlug: doc.publicSlug,
			updatedAt: doc.updatedAt,
			updatedBy: doc.updatedBy ? (people[doc.updatedBy] ?? unknownPerson(doc.updatedBy)) : null,
			frontmatter: doc.frontmatter as Record<string, unknown>
		},
		html,
		renderError
	};
};

export const actions: Actions = {
	publish: async ({ params, locals }) => {
		const { access } = requireUser(locals);
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) return fail(404, { error: 'not_found' });
		const outcome = await requestPublish(doc, access);
		if (outcome === 'forbidden') return fail(403, { error: 'forbidden' });
		return { published: outcome };
	},

	unpublish: async ({ params, locals }) => {
		const { access } = requireUser(locals);
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) return fail(404, { error: 'not_found' });
		if (!canMakePublic(await getPolicy(params.ws), access.role(params.ws))) {
			return fail(403, { error: 'forbidden' });
		}
		await unpublish(doc.id);
		return { unpublished: true };
	},

	approve: async ({ params, locals }) => {
		const { access } = requireUser(locals);
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) return fail(404, { error: 'not_found' });
		const outcome = await approvePublish(doc.id, access);
		if (outcome === 'forbidden') return fail(403, { error: 'forbidden' });
		return { approved: outcome };
	},

	reject: async ({ params, locals }) => {
		const { access } = requireUser(locals);
		const doc = await getDocBySlug(params.ws, params.slug);
		if (!doc) return fail(404, { error: 'not_found' });
		const outcome = await rejectPublish(doc.id, access);
		if (outcome === 'forbidden') return fail(403, { error: 'forbidden' });
		return { rejected: outcome };
	}
};
