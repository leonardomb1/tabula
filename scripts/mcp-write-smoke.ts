// Drives the MCP server's write tools directly against the live DB (no HTTP/auth),
// to validate create_doc / update_doc + the editor gate + the onDocUpdated hook.
import { db } from '../src/lib/server/db';
import { docs } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { ensureWorkspace } from '../src/lib/server/workspaces';
import { loadAccess, type Principal } from '../src/lib/server/access';
import { buildMcpServer } from '../src/lib/server/mcp/server';
import { StatelessTransport } from '../src/lib/server/mcp/transport';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
	if (!cond) failures++;
	console.log(`  [${cond ? 'ok  ' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`);
}

let idc = 100;
async function callTool(
	transport: StatelessTransport,
	name: string,
	args: Record<string, unknown>
): Promise<{ data?: any; isError?: boolean; raw: any }> {
	const reply = (await transport.handle({
		jsonrpc: '2.0',
		id: idc++,
		method: 'tools/call',
		params: { name, arguments: args }
	} as any)) as any;
	const result = reply?.result;
	const text = result?.content?.[0]?.text;
	let data: any;
	try {
		data = text ? JSON.parse(text) : undefined;
	} catch {
		data = text;
	}
	return { data, isError: result?.isError, raw: reply };
}

async function main() {
	const created: string[] = [];
	try {
		await ensureWorkspace('mcpwrite', 'MCP Write Test', 'team');

		// A platform-admin principal → editor everywhere.
		const admin: Principal = {
			username: 'mcpbot',
			claims: { user: ['mcpbot'] },
			isPlatformAdmin: true
		};
		const access = await loadAccess(admin);
		const server = buildMcpServer(access);
		const transport = new StatelessTransport();
		await server.connect(transport);
		await transport.handle({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }
		} as any);

		console.log('\n== create_doc ==');
		const c = await callTool(transport, 'create_doc', {
			workspaceId: 'mcpwrite',
			title: 'Platform Onboarding',
			source: '# Onboarding\n\nWritten via **MCP**. Links to [[somewhere]].'
		});
		const docId = c.data?.id as string | undefined;
		if (docId) created.push(docId);
		check('create returned id + slug', !!docId && c.data?.slug === 'platform-onboarding', c.data?.slug ?? '');

		console.log('\n== get_doc round-trips the source ==');
		const g = await callTool(transport, 'get_doc', { id: docId });
		check('source persisted', /Written via/.test(g.data?.source ?? ''));
		check('created private (not public)', g.data?.isPublic === false);

		console.log('\n== update_doc records a new version ==');
		const u = await callTool(transport, 'update_doc', {
			id: docId,
			source: '# Onboarding v2\n\nEdited via MCP.'
		});
		check('update returned same id', u.data?.id === docId);
		const g2 = await callTool(transport, 'get_doc', { id: docId });
		check('updated content persisted', /Onboarding v2/.test(g2.data?.source ?? ''));

		console.log('\n== error paths ==');
		const miss = await callTool(transport, 'update_doc', { id: 'doesnotexist', source: 'x' });
		check('update missing doc -> isError', miss.isError === true);

		// Editor gate: a principal with no access to the workspace must be refused.
		const outsiderAccess = await loadAccess({ username: 'outsider', claims: { user: ['outsider'] }, isPlatformAdmin: false });
		const outsiderServer = buildMcpServer(outsiderAccess);
		const ot = new StatelessTransport();
		await outsiderServer.connect(ot);
		const denied = (await (async () => {
			const reply = (await ot.handle({ jsonrpc: '2.0', id: 200, method: 'tools/call', params: { name: 'create_doc', arguments: { workspaceId: 'mcpwrite', title: 'Sneaky', source: 'x' } } } as any)) as any;
			return reply?.result;
		})());
		check('non-editor create -> isError', denied?.isError === true, denied?.content?.[0]?.text ?? '');

		await server.close();
		await outsiderServer.close();
	} finally {
		if (created.length) await db.delete(docs).where(eq(docs.id, created[0]));
	}

	console.log(failures === 0 ? '\nALL PASS' : `\n${failures} CHECK(S) FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

main();
