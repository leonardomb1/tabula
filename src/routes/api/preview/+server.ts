import { json } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/markdown';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { content } = await request.json();
	const { html, toc, title } = renderMarkdown(content ?? '');
	return json({ html, toc, title });
};
