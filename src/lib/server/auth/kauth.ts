export interface KauthUser {
	sAMAccountName: string;
	displayName?: string;
	mail?: string;
	title?: string;
	memberOf: string[];
	employeeID?: string;
	userPrincipalName?: string;
	additionalInfo?: Record<string, unknown>;
}

export type KauthRejection = 'invalid' | 'disabled' | 'locked';

export type KauthResult =
	| { ok: true; user: KauthUser }
	| { ok: false; reason: KauthRejection; code: string };

const TIMEOUT_MS = Number(process.env.KAUTH_TIMEOUT_MS ?? 30_000);

export async function kauthAuthenticate(
	identifier: string,
	password: string
): Promise<KauthResult> {
	const url = process.env.KAUTH_URL;
	if (!url) throw new Error('KAUTH_URL is not set');
	const token = process.env.KAUTH_TOKEN;
	if (!token) throw new Error('KAUTH_TOKEN is not set');

	let res: Response;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ identifier, password, fetchAdditionalData: true }),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (err) {
		const why = err instanceof Error && err.name === 'TimeoutError' ? 'timed out' : String(err);
		throw new Error(`k-auth: request failed (${why})`);
	}

	if (!res.ok) {
		if (res.status >= 500) {
			throw new Error(`k-auth: directory error ${res.status}`);
		}

		const body = await res.text();
		let failure: { error?: string; message?: string } | null = null;
		try {
			failure = JSON.parse(body) as { error?: string; message?: string };
		} catch {
			failure = null;
		}
		if (!failure?.error) {
			throw new Error(
				`k-auth: call rejected before the script ran (${res.status}) — check KAUTH_TOKEN`
			);
		}

		const reason: KauthRejection =
			res.status === 423 ? 'locked' : res.status === 403 ? 'disabled' : 'invalid';
		return { ok: false, reason, code: failure.error };
	}

	const data: unknown = await res.json().catch(() => null);
	if (!isKauthUser(data)) {
		throw new Error('k-auth: unexpected success payload');
	}

	const user: KauthUser = {
		sAMAccountName: data.sAMAccountName,
		displayName: data.displayName,
		mail: data.mail,
		title: data.title,
		memberOf: data.memberOf,
		employeeID: data.employeeID,
		userPrincipalName: data.userPrincipalName,
		additionalInfo: data.additionalInfo
	};

	return { ok: true, user };
}

function isKauthUser(d: unknown): d is KauthUser {
	return (
		typeof d === 'object' &&
		d !== null &&
		typeof (d as KauthUser).sAMAccountName === 'string' &&
		Array.isArray((d as KauthUser).memberOf)
	);
}
