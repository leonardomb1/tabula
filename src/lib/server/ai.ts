import Anthropic from '@anthropic-ai/sdk';
import { AzureOpenAI } from 'openai';

const SYSTEM_PROMPT = `You are a helpful assistant for an internal documentation platform.
Answer questions based solely on the provided documents.
When the user is viewing a specific page, treat it as their primary context.
If the answer is not in the documents, say so clearly.
Be concise and direct. Format your response in markdown.

After your answer, if you used specific passages from the documents, append exactly one line in this format (no prose, no label, just the JSON):
REFS:[{"slug":"document-slug","quote":"verbatim excerpt from that document, max 120 chars"}]

Rules for REFS:
- Only include passages you actually quoted or paraphrased directly.
- The quote must be copied verbatim from the source text (exact casing and punctuation).
- Omit REFS entirely if you made no direct reference to specific passages.`;

export function getProvider(): 'anthropic' | 'azure-openai' | null {
	const p = (process.env.AI_PROVIDER ?? '').toLowerCase();
	if (p === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
	if (p === 'azure-openai' &&
		process.env.AZURE_OPENAI_ENDPOINT &&
		process.env.AZURE_OPENAI_API_KEY &&
		process.env.AZURE_OPENAI_DEPLOYMENT) return 'azure-openai';
	return null;
}

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

export async function* streamAnswer(
	docs: { slug: string; title: string; body: string }[],
	question: string,
	currentSlug?: string | null,
	history?: HistoryMessage[]
): AsyncGenerator<string> {
	const provider = getProvider();
	if (!provider) throw new Error('AI not configured');

	const context = docs
		.map((d) => `### "${d.title}" (/${d.slug})\n\n${d.body.slice(0, 4000)}`)
		.join('\n\n---\n\n');

	const pageNote = currentSlug
		? `[The user is currently viewing: /${currentSlug} — treat it as primary context.]`
		: '';

	// History is clean question/answer pairs — no document context embedded.
	// Documents go into the system prompt only, so they never bloat history.
	const historyMessages: { role: 'user' | 'assistant'; content: string }[] =
		(history ?? []).map((h) => ({ role: h.role, content: h.content }));

	const userMessage = [pageNote, question].filter(Boolean).join('\n');
	const allMessages = [...historyMessages, { role: 'user' as const, content: userMessage }];

	if (provider === 'anthropic') {
		const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
		const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

		// Documents in a cached system block — Anthropic reuses it across turns
		// at ~10% of normal token cost after the first call in a session.
		const systemBlocks: Anthropic.TextBlockParam[] = [
			{ type: 'text', text: SYSTEM_PROMPT },
			{ type: 'text', text: `<documents>\n${context}\n</documents>`, cache_control: { type: 'ephemeral' } }
		];

		const stream = client.messages.stream({
			model,
			max_tokens: 2048,
			system: systemBlocks,
			messages: allMessages
		});

		for await (const event of stream) {
			if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
				yield event.delta.text;
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
			max_tokens: 2048,
			stream: true,
			messages: [
				{ role: 'system', content: `${SYSTEM_PROMPT}\n\n<documents>\n${context}\n</documents>` },
				...allMessages
			]
		});

		for await (const chunk of stream) {
			const text = chunk.choices[0]?.delta?.content ?? '';
			if (text) yield text;
		}
	}
}

