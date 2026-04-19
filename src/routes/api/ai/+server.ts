import { error } from '@sveltejs/kit';
import { streamAnswer, getProvider } from '$lib/server/ai';
import { getAllDocs } from '$lib/server/docsIndex';
import { listForUser, PERSONAL_PREFIX } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

function scoreRelevance(text: string, words: string[]): number {
	const lower = text.toLowerCase();
	return words.reduce((s, w) => s + (lower.split(w).length - 1), 0);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!getProvider()) error(503, 'AI não configurado');
	if (!locals.user) error(401, 'Autenticação obrigatória');
	const user = locals.user;

	const { question, currentSlug, currentWs, history } = await request.json();
	if (!question || typeof question !== 'string' || !question.trim()) {
		error(400, 'Pergunta obrigatória');
	}

	// Pool docs across every workspace the user can see — their personal,
	// plus every team they're a member of. Personal workspaces are implicit
	// (no listing), so we pull the user's own personal slug deterministically.
	const teams = await listForUser(user);
	const wsIds = [...new Set([
		`${PERSONAL_PREFIX}${user.username}`,
		...teams.map((w) => w.id)
	])];

	const bundles = await Promise.all(
		wsIds.map(async (wsId) => {
			const rows = await getAllDocs(wsId);
			return rows.map((d) => ({
				wsId,
				slug: d.slug,
				title: d.title,
				body: d.body
			}));
		})
	);
	const all = bundles.flat();
	if (all.length === 0) error(404, 'Nenhum documento encontrado');

	const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
	const scored = all.map((d) => ({
		...d,
		score: words.length > 0 ? scoreRelevance(d.title + ' ' + d.body, words) : 1
	}));

	// Pin the current doc when the user is actively viewing one. Pairing by
	// (wsId, slug) prevents an unrelated same-slug doc in another workspace
	// from winning the pin.
	const pinned = currentSlug
		? scored.filter(
				(d) => d.slug === currentSlug && (!currentWs || d.wsId === currentWs)
			)
		: [];
	const rest = scored
		.filter((d) => !pinned.includes(d))
		.sort((a, b) => b.score - a.score)
		.slice(0, 8 - pinned.length);
	const relevant = [...pinned, ...rest];

	const enc = new TextEncoder();
	const readable = new ReadableStream({
		async start(controller) {
			try {
				for await (const chunk of streamAnswer(
					relevant,
					question.trim(),
					currentSlug,
					currentWs,
					history
				)) {
					controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
				}
				controller.enqueue(enc.encode('data: [DONE]\n\n'));
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Erro desconhecido';
				controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
			} finally {
				controller.close();
			}
		}
	});

	return new Response(readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'X-Accel-Buffering': 'no'
		}
	});
};
