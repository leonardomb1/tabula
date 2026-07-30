import { error, fail } from '@sveltejs/kit';
import { getBacklinks, getDocBySlug, resolveDocRefs } from '$lib/server/docs';
import { renderMarkdown } from '$lib/server/markdown';
import { getOrCompileSvg, TypstCompileError } from '$lib/server/typst';
import { listTemplates, parseTemplateMeta } from '$lib/server/templates';
import { getPeople, unknownPerson } from '$lib/server/people';
import { getPolicy } from '$lib/server/workspaces';
import { openReview, voteOnReview } from '$lib/server/publication';
import { recordView } from '$lib/server/views';
import { requireUser } from '$lib/server/apiGuards';
import { isApprover } from '$lib/policy';
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

	const [backlinks, templates, people, pending] = await Promise.all([
		getBacklinks(doc),
		listTemplates(params.ws),
		doc.updatedBy && locals.user
			? getPeople([doc.updatedBy], params.ws)
			: Promise.resolve({} as Record<string, Person>),
		openReview(doc.id, 'publish')
	]);

	recordView(doc.id, 'app');

	let canApprove = false;
	if (pending && locals.access) {
		const policy = await getPolicy(params.ws);
		canApprove = isApprover(policy, locals.access.role(params.ws), locals.access.principal.claims);
	}

	return {
		pendingPublish: pending
			? { id: pending.id, requestedBy: pending.requestedBy ?? '', canApprove }
			: null,
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
			updatedBy: doc.updatedBy
				? (people[doc.updatedBy] ?? unknownPerson(doc.updatedBy))
				: null,
			frontmatter: doc.frontmatter as Record<string, unknown>
		},
		html,
		renderError,
		backlinks: backlinks.map((b) => ({ id: b.id, slug: b.slug, title: b.title }))
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		const { access } = requireUser(locals);
		const id = Number((await request.formData()).get('review'));
		if (!Number.isInteger(id)) return fail(400, { error: 'bad_review' });
		const outcome = await voteOnReview(id, 'approve', access);
		if (outcome === 'forbidden') return fail(403, { error: 'forbidden' });
		return { outcome };
	},

	reject: async ({ request, locals }) => {
		const { access } = requireUser(locals);
		const id = Number((await request.formData()).get('review'));
		if (!Number.isInteger(id)) return fail(400, { error: 'bad_review' });
		const outcome = await voteOnReview(id, 'reject', access);
		if (outcome === 'forbidden') return fail(403, { error: 'forbidden' });
		return { outcome };
	}
};
