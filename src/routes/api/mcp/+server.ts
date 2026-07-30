import { json, type RequestHandler } from '@sveltejs/kit';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { loadAccess } from '$lib/server/access';
import { principalFromToken } from '$lib/server/tokens';
import { buildMcpServer } from '$lib/server/mcp/server';
import { StatelessTransport } from '$lib/server/mcp/transport';

/**
 * A fresh Response per call: a module-level singleton can only be returned once,
 * after which its body is locked and every later rejection fails with a framework
 * error instead of a clean 401.
 */
const unauthorized = () =>
	new Response('Unauthorized', {
		status: 401,
		headers: { 'www-authenticate': 'Bearer realm="tabula-mcp"' }
	});

export const POST: RequestHandler = async ({ request }) => {
	const auth = request.headers.get('authorization') ?? '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
	if (!token) return unauthorized();

	const principal = await principalFromToken(token);
	if (!principal) return unauthorized();

	const body = (await request.json().catch(() => null)) as JSONRPCMessage | JSONRPCMessage[] | null;
	if (!body) return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, { status: 400 });

	const access = await loadAccess(principal);
	const server = buildMcpServer(access);
	const transport = new StatelessTransport();
	await server.connect(transport);

	try {
		const messages = Array.isArray(body) ? body : [body];
		const replies: JSONRPCMessage[] = [];
		for (const m of messages) {
			const reply = await transport.handle(m);
			if (reply) replies.push(reply);
		}
		if (replies.length === 0) return new Response(null, { status: 202 });
		return json(Array.isArray(body) ? replies : replies[0]);
	} finally {
		await server.close();
	}
};

export const GET: RequestHandler = () => new Response('Method Not Allowed', { status: 405 });
