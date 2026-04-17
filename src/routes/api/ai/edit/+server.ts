import { error } from '@sveltejs/kit';
import { getProvider } from '$lib/server/ai';
import Anthropic from '@anthropic-ai/sdk';
import { AzureOpenAI } from 'openai';
import type { RequestHandler } from './$types';

const SYSTEM_PROMPT = `You are a writing assistant for an internal documentation platform.
Rewrite or modify the provided text according to the user's instruction.
Return ONLY the modified text — no explanations, no preamble, no extra commentary.
Preserve the original language (if Portuguese, respond in Portuguese).
Preserve markdown formatting unless the instruction says otherwise.`;

export const POST: RequestHandler = async ({ request }) => {
	if (!getProvider()) error(503, 'AI não configurado');

	const { selectedText, instruction } = await request.json();
	if (!selectedText?.trim()) error(400, 'Texto obrigatório');
	if (!instruction?.trim()) error(400, 'Instrução obrigatória');

	const provider = getProvider()!;
	const userPrompt = `Text:\n\n${selectedText}\n\n---\n\nInstruction: ${instruction}`;

	const enc = new TextEncoder();
	const readable = new ReadableStream({
		async start(controller) {
			try {
				if (provider === 'anthropic') {
					const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
					const stream = client.messages.stream({
						model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5',
						max_tokens: 4096,
						system: SYSTEM_PROMPT,
						messages: [{ role: 'user', content: userPrompt }]
					});
					for await (const event of stream) {
						if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
							controller.enqueue(enc.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
						}
					}
				} else {
					const client = new AzureOpenAI({
						endpoint: process.env.AZURE_OPENAI_ENDPOINT,
						apiKey: process.env.AZURE_OPENAI_API_KEY,
						apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview',
						deployment: process.env.AZURE_OPENAI_DEPLOYMENT
					});
					const stream = await client.chat.completions.create({
						model: process.env.AZURE_OPENAI_DEPLOYMENT!,
						max_tokens: 4096,
						stream: true,
						messages: [
							{ role: 'system', content: SYSTEM_PROMPT },
							{ role: 'user', content: userPrompt }
						]
					});
					for await (const chunk of stream) {
						const text = chunk.choices[0]?.delta?.content ?? '';
						if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ text })}\n\n`));
					}
				}
				controller.enqueue(enc.encode('data: [DONE]\n\n'));
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'Erro';
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
