/**
 * The DB-free half of password sign-in: input normalisation, filter escaping,
 * AD failure classification, and the claim vocabulary handed to sessionFor.
 *
 *   bun test src/lib/server/auth
 *
 * The live section binds against a real directory and only runs when
 * LDAP_LIVE_TEST=1 alongside the LDAP_* settings, so CI never reaches out.
 */
import { expect, test, afterEach } from 'bun:test';
import { ATTR } from '$lib/rbac';
import { principalFromClaims } from './index';
import {
	adSubcode,
	bareUsername,
	classifyBindFailure,
	escapeFilterValue,
	ldapAuthenticate
} from './ldap';

const ENV = { ...process.env };
afterEach(() => {
	process.env = { ...ENV };
});

test('every way of writing an account name resolves to the bare login', () => {
	expect(bareUsername('jdoe')).toBe('jdoe');
	expect(bareUsername('  jdoe  ')).toBe('jdoe');
	expect(bareUsername('CORP\\jdoe')).toBe('jdoe');
	expect(bareUsername('jdoe@corp.example.com')).toBe('jdoe');
	expect(bareUsername('CORP\\jdoe@corp.example.com')).toBe('jdoe');
	expect(bareUsername('@corp.example.com')).toBe('@corp.example.com');
});

test('filter metacharacters in a username cannot rewrite the search', () => {
	expect(escapeFilterValue('a*b(c)d\\e\0f')).toBe('a\\2ab\\28c\\29d\\5ce\\00f');
	expect(escapeFilterValue('plain.name')).toBe('plain.name');
});

test('AD sub-codes map to the outcomes a person can act on, the rest to invalid', () => {
	const ad = (data: string) =>
		`80090308: LdapErr: DSID-0C090530, comment: AcceptSecurityContext error, data ${data}, v4563`;
	expect(adSubcode(ad('52e'))).toBe('52e');
	expect(classifyBindFailure(ad('52e'))).toEqual({ reason: 'invalid', code: '52e' });
	expect(classifyBindFailure(ad('525')).reason).toBe('invalid');
	expect(classifyBindFailure(ad('533')).reason).toBe('disabled');
	expect(classifyBindFailure(ad('701')).reason).toBe('disabled');
	expect(classifyBindFailure(ad('775')).reason).toBe('locked');
	expect(classifyBindFailure(ad('532')).reason).toBe('expired');
	expect(classifyBindFailure(ad('773')).reason).toBe('expired');
	// OpenLDAP says nothing beyond the result code.
	expect(classifyBindFailure('Invalid Credentials')).toEqual({ reason: 'invalid', code: undefined });
});

test('an empty password never reaches the directory', async () => {
	process.env.LDAP_URL = 'ldaps://127.0.0.1:1';
	process.env.LDAP_BIND_DN = 'svc';
	expect(await ldapAuthenticate('jdoe', '')).toEqual({ ok: false, reason: 'invalid' });
	expect(await ldapAuthenticate('', 'secret')).toEqual({ ok: false, reason: 'invalid' });
});

test('LDAP claims bind under the same names as the ID token, whatever OIDC_USERNAME_CLAIM says', () => {
	process.env.OIDC_USERNAME_CLAIM = 'upn';
	const p = principalFromClaims(
		{
			sub: 'CN=J Doe,OU=People,DC=corp,DC=example,DC=com',
			preferred_username: 'jdoe',
			name: 'J Doe',
			email: 'j@example.com',
			groups: ['CN=Engineering,OU=Groups,DC=corp,DC=example,DC=com'],
			department: 'Platform'
		},
		'preferred_username'
	);
	expect(p.username).toBe('jdoe');
	expect(p.claims[ATTR.USER]).toEqual(['jdoe']);
	expect(p.claims[ATTR.GROUPS]).toEqual([
		'CN=Engineering,OU=Groups,DC=corp,DC=example,DC=com',
		'Engineering'
	]);
	expect(p.claims.department).toEqual(['Platform']);
	expect(p.claims.sub).toBeUndefined();
	expect(p.displayName).toBe('J Doe');
	expect(p.mail).toBe('j@example.com');
});

const live = process.env.LDAP_LIVE_TEST === '1' && !!process.env.LDAP_URL;

test.skipIf(!live)('live: the service account signs itself in and reads its groups', async () => {
	const r = await ldapAuthenticate(process.env.LDAP_BIND_DN!, process.env.LDAP_BIND_PASSWORD!);
	expect(r.ok).toBe(true);
	if (!r.ok) return;
	expect(r.claims.preferred_username).toBe(bareUsername(process.env.LDAP_BIND_DN!));
	expect(Array.isArray(r.claims.groups)).toBe(true);
	const p = principalFromClaims(r.claims, 'preferred_username');
	expect(p.claims[ATTR.USER]).toEqual([bareUsername(process.env.LDAP_BIND_DN!)]);
});

test.skipIf(!live)('live: direct UPN bind works without the service account', async () => {
	const dn = process.env.LDAP_BIND_DN!;
	const pw = process.env.LDAP_BIND_PASSWORD!;
	delete process.env.LDAP_BIND_DN;
	delete process.env.LDAP_BIND_PASSWORD;
	const r = await ldapAuthenticate(bareUsername(dn), pw);
	expect(r.ok).toBe(true);
	if (r.ok) expect(r.claims.preferred_username).toBe(bareUsername(dn));
});

test.skipIf(!live)('live: an unknown user is just invalid, in both strategies', async () => {
	// A nonexistent account: nothing to lock out, and AD answers 52e either way.
	expect(await ldapAuthenticate('tabula.nobody.zz', 'nope')).toEqual({ ok: false, reason: 'invalid' });
	delete process.env.LDAP_BIND_DN;
	delete process.env.LDAP_BIND_PASSWORD;
	expect(await ldapAuthenticate('tabula.nobody.zz', 'nope')).toMatchObject({ ok: false, reason: 'invalid' });
});
