/**
 * Copy for an HTTP status. Falls back by class, so an unmapped 4xx or 5xx still
 * gets an honest page rather than a blank one.
 */

import * as m from '$lib/paraglide/messages';

export interface ErrorCopy {
	title: string;
	description: string;
}

const BY_STATUS: Record<number, () => ErrorCopy> = {
	400: () => ({ title: m.error_400_title(), description: m.error_400_desc() }),
	401: () => ({ title: m.error_401_title(), description: m.error_401_desc() }),
	403: () => ({ title: m.error_403_title(), description: m.error_403_desc() }),
	404: () => ({ title: m.error_404_title(), description: m.error_404_desc() }),
	409: () => ({ title: m.error_409_title(), description: m.error_409_desc() }),
	413: () => ({ title: m.error_413_title(), description: m.error_413_desc() }),
	422: () => ({ title: m.error_422_title(), description: m.error_422_desc() }),
	429: () => ({ title: m.error_429_title(), description: m.error_429_desc() }),
	500: () => ({ title: m.error_500_title(), description: m.error_500_desc() }),
	503: () => ({ title: m.error_503_title(), description: m.error_503_desc() })
};

export function errorCopy(status: number): ErrorCopy {
	const exact = BY_STATUS[status];
	if (exact) return exact();

	return {
		title: m.error_generic_title(),
		description: status >= 500 ? m.error_5xx_desc() : m.error_4xx_desc()
	};
}

/**
 * Framework-generated messages that only restate the status ("Not Found") carry no
 * information, unlike the app's own ("workspace already exists"). Only the latter
 * is worth showing next to the description.
 */
const GENERIC = new Set([
	'not found',
	'forbidden',
	'unauthorized',
	'bad request',
	'internal error',
	'internal server error',
	'service unavailable',
	'conflict',
	'payload too large',
	'unprocessable entity',
	'too many requests'
]);

export function usefulDetail(message: string | undefined, status: number): string {
	const text = (message ?? '').trim();
	if (!text) return '';
	if (GENERIC.has(text.toLowerCase())) return '';
	if (text === String(status)) return '';
	return text;
}
