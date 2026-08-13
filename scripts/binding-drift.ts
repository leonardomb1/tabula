/**
 * Reports workspace bindings and gate rules that no known user satisfies.
 *
 * The point is the OIDC cutover: bindings were written against the group strings
 * k-auth produced, and Authentik will produce its own. A binding whose value no
 * longer appears in anyone's claims silently grants nothing — no error, people
 * just lose access. This surfaces those before they become tickets.
 *
 * Evidence is the `claims` snapshot recorded in user_settings at each sign-in,
 * so the report only knows about people who have signed in. Run it once before
 * the cutover to get the baseline of what was already dead, then again after
 * enough users have signed in through Authentik: entries in the second run that
 * were not in the first are the drift.
 *
 *   bun run scripts/binding-drift.ts
 */
import postgres from 'postgres';
import { matchesSelector } from '../src/lib/rbac';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(url, { max: 1 });

interface Row {
	attribute: string;
	value: string;
	where: string;
}

try {
	const users: { username: string; claims: Record<string, string[]> }[] = await sql`
		SELECT username, claims FROM user_settings WHERE last_seen_at IS NOT NULL
	`;

	if (users.length === 0) {
		console.error('No sign-in snapshots recorded yet — nothing to check bindings against.');
		process.exit(1);
	}

	const bindings: Row[] = await sql`
		SELECT attribute, value, 'workspace ' || workspace_id || ' (' || role || ')' AS where
		FROM workspace_bindings ORDER BY workspace_id, attribute, value
	`;
	const rules: Row[] = await sql`
		SELECT attribute, value, 'platform gate' AS where FROM access_rules
		ORDER BY attribute, value
	`;

	const dead = [...bindings, ...rules].filter(
		(r) => !users.some((u) => matchesSelector({ attribute: r.attribute, value: r.value }, u.claims))
	);

	console.log(`Checked ${bindings.length} bindings and ${rules.length} gate rules`);
	console.log(`against the claims of ${users.length} user(s) who have signed in.\n`);

	if (dead.length === 0) {
		console.log('Every binding and rule matches at least one known user.');
	} else {
		console.log(`${dead.length} match nobody:\n`);
		for (const r of dead) console.log(`  ${r.attribute} = ${r.value}\n    ${r.where}`);
		console.log('\nA binding can match nobody legitimately (nobody in that group has signed in');
		console.log('yet). Compare against the pre-cutover run before rewriting anything.');
	}
} finally {
	await sql.end();
}
