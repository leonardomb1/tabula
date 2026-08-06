// Validates the simplified publication model against the live DB.
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/server/db';
import { docs } from '../src/lib/server/db/schema';
import { ensureWorkspace, upsertBinding, updatePolicy } from '../src/lib/server/workspaces';
import { loadAccess, type Principal } from '../src/lib/server/access';
import { createDoc, getDoc } from '../src/lib/server/docs';
import {
	requestPublish,
	approvePublish,
	unpublish,
	openPublishRequest
} from '../src/lib/server/publication';
import { DEFAULT_POLICY } from '../src/lib/policy';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
	if (!cond) failures++;
	console.log(`  [${cond ? 'ok  ' : 'FAIL'}] ${name}${detail ? '  ' + detail : ''}`);
}

const editor: Principal = { username: 'pub_ed', claims: { user: ['pub_ed'] }, isPlatformAdmin: false };
const maint: Principal = { username: 'pub_mn', claims: { user: ['pub_mn'] }, isPlatformAdmin: false };
const rando: Principal = { username: 'pub_rd', claims: { user: ['pub_rd'] }, isPlatformAdmin: false };

async function main() {
	const created: string[] = [];
	try {
		await ensureWorkspace('pubtest', 'Pub Test', 'team');
		await updatePolicy('pubtest', {
			editor: { ...DEFAULT_POLICY.editor, makePublic: true },
			allowPublic: true,
			approvePublic: true
		});
		await upsertBinding({ workspaceId: 'pubtest', attribute: 'user', value: 'pub_ed', role: 'editor' });
		await upsertBinding({ workspaceId: 'pubtest', attribute: 'user', value: 'pub_mn', role: 'maintainer' });

		const edAcc = await loadAccess(editor);
		const mnAcc = await loadAccess(maint);
		const rdAcc = await loadAccess(rando);

		const doc = await createDoc({
			workspaceId: 'pubtest',
			title: 'Release Notes',
			mode: 'markdown',
			source: '# Notes\n\nInitial.',
			actor: 'pub_ed'
		});
		created.push(doc.id);

		console.log('\n== editor publish needs approval ==');
		check("editor requestPublish -> 'pending'", (await requestPublish(doc, edAcc)) === 'pending');
		check('pending request recorded', (await openPublishRequest(doc.id)) !== null);
		check('not public yet', (await getDoc(doc.id))?.isPublic === false);

		console.log('\n== outsider is refused ==');
		check("no-access requestPublish -> 'forbidden'", (await requestPublish(doc, rdAcc)) === 'forbidden');

		console.log('\n== maintainer approves ==');
		check("approvePublish -> 'approved'", (await approvePublish(doc.id, mnAcc)) === 'approved');
		const afterApprove = await getDoc(doc.id);
		check('now public with a slug', afterApprove?.isPublic === true && !!afterApprove?.publicSlug, afterApprove?.publicSlug ?? '');
		check('request resolved (no longer open)', (await openPublishRequest(doc.id)) === null);

		console.log('\n== unpublish is direct ==');
		await unpublish(doc.id);
		check('private again', (await getDoc(doc.id))?.isPublic === false);

		console.log('\n== maintainer publishes directly (no approval) ==');
		const doc2 = await getDoc(doc.id);
		check("maintainer requestPublish -> 'published'", (await requestPublish(doc2!, mnAcc)) === 'published');
		check('public immediately', (await getDoc(doc.id))?.isPublic === true);
	} finally {
		if (created.length) await db.delete(docs).where(eq(docs.id, created[0]));
	}

	console.log(failures === 0 ? '\nALL PASS' : `\n${failures} CHECK(S) FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

main();
