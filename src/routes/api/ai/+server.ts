import { error } from '@sveltejs/kit';
import { streamAnswer, getProvider } from '$lib/server/ai';
import { getAllDocs } from '$lib/server/docsIndex';
import { DEFAULT_WS_ID } from '$lib/server/workspaces';
import type { RequestHandler } from './$types';

function scoreRelevance(text: string, words: string[]): number {
	const lower = text.toLowerCase();
	return words.reduce((s, w) => s + (lower.split(w).length - 1), 0);
}

export const POST: RequestHandler = async ({ request, url }) => {
	if (!getProvider()) error(503, 'AI não configurado');

	const { question, currentSlug, history } = await request.json();
	const wsId = url.searchParams.get('ws') ?? DEFAULT_WS_ID;
	if (!question || typeof question !== 'string' || !question.trim()) {
		error(400, 'Pergunta obrigatória');
	}

	const cached = await getAllDocs(wsId);
	if (cached.length === 0) error(404, 'Nenhum documento encontrado');

	const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
	const docs = cached.map((d) => ({
		slug: d.slug,
		title: d.title,
		body: d.body,
		score: words.length > 0 ? scoreRelevance(d.title + ' ' + d.body, words) : 1
	}));

	const pinned = currentSlug ? docs.filter((d) => d.slug === currentSlug) : [];
	const rest = docs
		.filter((d) => d.slug !== currentSlug)
		.sort((a, b) => b.score - a.score)
		.slice(0, 8 - pinned.length);
	const relevant = [...pinned, ...rest];

	const enc = new TextEncoder();
	const readable = new ReadableStream({
		async start(controller) {
			try {
				for await (const chunk of streamAnswer(relevant, question.trim(), currentSlug, history)) {
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
