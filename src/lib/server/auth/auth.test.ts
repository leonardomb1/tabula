/**
 * The DB-free half of sign-in: claim mapping and the PKCE/state handshake.
 * Everything RBAC keys on comes out of principalFromClaims, so a silent change
 * there is the failure worth catching.
 *
 *   bun test src/lib/server/auth
 */
import { expect, test, afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { ATTR } from '$lib/rbac';
import { packFlow, principalFromClaims, safeRedirect, unpackFlow } from './index';
import { authorizeUrl, decodeIdToken } from './oidc';

const ENV = { ...process.env };
afterEach(() => {
	process.env = { ...ENV };
});

test('claims map onto the attributes bindings match against', () => {
	const p = principalFromClaims({
		sub: 'a-uuid',
		preferred_username: 'jdoe',
		name: 'J Doe',
		email: 'j@example.com',
		groups: ['Engineering'],
		cost_center: '4711'
	});

	expect(p.username).toBe('jdoe');
	expect(p.claims[ATTR.USER]).toEqual(['jdoe']);
	expect(p.claims[ATTR.GROUPS]).toEqual(['Engineering']);
	expect(p.claims.cost_center).toEqual(['4711']);
	expect(p.isPlatformAdmin).toBe(false);
});

test('an unmapped claim becomes bindable without any code knowing its name', () => {
	const p = principalFromClaims({
		sub: 'a-uuid',
		preferred_username: 'jdoe',
		department: 'Platform',
		seniority: 3,
		email_verified: true
	});

	expect(p.claims.department).toEqual(['Platform']);
	expect(p.claims.seniority).toEqual(['3']);
	expect(p.claims.email_verified).toEqual(['true']);
});

test('protocol claims stay out of the bindable set', () => {
	const p = principalFromClaims({
		sub: 'a-uuid',
		preferred_username: 'jdoe',
		iss: 'https://idp.example',
		aud: 'tabula',
		exp: 1_800_000_000,
		nonce: 'n',
		address: { locality: 'nested objects have no match form' }
	});

	for (const name of ['sub', 'iss', 'aud', 'exp', 'nonce', 'address']) {
		expect(p.claims[name]).toBeUndefined();
	}
	expect(p.claims[ATTR.USER]).toEqual(['jdoe']);
});

test('a group given as a DN also matches bindings written against its CN', () => {
	const p = principalFromClaims({
		sub: 'a-uuid',
		preferred_username: 'jdoe',
		groups: ['CN=Engineering,OU=Groups,DC=corp,DC=example']
	});

	expect(p.claims[ATTR.GROUPS]).toEqual([
		'CN=Engineering,OU=Groups,DC=corp,DC=example',
		'Engineering'
	]);
});

test('admin standing comes from either env list, case-insensitively', () => {
	process.env.PLATFORM_ADMIN_GROUPS = 'Platform Admins';
	expect(
		principalFromClaims({ sub: 'u', preferred_username: 'jdoe', groups: ['platform admins'] })
			.isPlatformAdmin
	).toBe(true);

	process.env.PLATFORM_ADMIN_GROUPS = '';
	process.env.PLATFORM_ADMIN_USERS = 'JDoe,other';
	expect(principalFromClaims({ sub: 'u', preferred_username: 'jdoe' }).isPlatformAdmin).toBe(true);
});

test('a missing username claim throws instead of falling back to sub', () => {
	expect(() => principalFromClaims({ sub: 'a-uuid' })).toThrow(/preferred_username/);
});

test('OIDC_USERNAME_CLAIM redirects which claim becomes the username', () => {
	process.env.OIDC_USERNAME_CLAIM = 'nickname';
	const p = principalFromClaims({ sub: 'u', preferred_username: 'wrong', nickname: 'jdoe' });
	expect(p.username).toBe('jdoe');
});

test('the authorize URL carries an S256 challenge derived from the verifier', async () => {
	process.env.OIDC_ISSUER = 'https://idp.example/application/o/tabula/';
	process.env.OIDC_CLIENT_ID = 'tabula';

	const original = globalThis.fetch;
	const stub = async () =>
		Response.json({
			authorization_endpoint: 'https://idp.example/application/o/authorize/',
			token_endpoint: 'https://idp.example/application/o/token/'
		});
	stub.preconnect = original.preconnect;
	globalThis.fetch = stub;

	try {
		const start = await authorizeUrl('https://app.example/auth/callback');
		const params = new URL(start.url).searchParams;

		expect(params.get('code_challenge_method')).toBe('S256');
		expect(params.get('code_challenge')).toBe(
			createHash('sha256').update(start.verifier).digest('base64url')
		);
		expect(params.get('state')).toBe(start.state);
		expect(params.get('redirect_uri')).toBe('https://app.example/auth/callback');
		expect(params.get('response_type')).toBe('code');
	} finally {
		globalThis.fetch = original;
	}
});

test('the flow cookie round-trips and rejects anything malformed', () => {
	const flow = { state: 's', verifier: 'v', redirectTo: '/w/eng' };
	expect(unpackFlow(packFlow(flow))).toEqual(flow);

	expect(unpackFlow(undefined)).toBeNull();
	expect(unpackFlow('not-base64url-json')).toBeNull();
	expect(unpackFlow(Buffer.from('{"state":1}').toString('base64url'))).toBeNull();
});

test('id_token payloads decode, and a malformed one throws', () => {
	const payload = Buffer.from(JSON.stringify({ sub: 'u', preferred_username: 'jdoe' })).toString(
		'base64url'
	);
	expect(decodeIdToken(`header.${payload}.signature`).preferred_username).toBe('jdoe');

	expect(() => decodeIdToken('nope')).toThrow(/malformed/);
	expect(() =>
		decodeIdToken(`header.${Buffer.from('{}').toString('base64url')}.sig`)
	).toThrow(/sub/);
});

test('redirect targets cannot leave the app', () => {
	expect(safeRedirect('/w/eng')).toBe('/w/eng');
	expect(safeRedirect('//evil.example')).toBe('/');
	expect(safeRedirect('https://evil.example')).toBe('/');
	expect(safeRedirect(null)).toBe('/');
});
