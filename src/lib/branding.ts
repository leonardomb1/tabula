/**
 * Deployment-level branding. Reads env vars server-side and exposes a
 * serializable shape that flows to the client via +layout.server.ts.
 *
 * Defaults are deliberately generic so the repo itself ships as neutral OSS.
 */
import { env } from '$env/dynamic/private';

export interface Branding {
	name: string;
	color: string;
	logoUrl: string | null;
	/** Inverted variant preferred in the tinta (dark) theme. Missing file
	 *  is handled client-side by falling through to logoUrl. */
	logoNegativeUrl: string | null;
	/**
	 * Server-resolved theme from the `tabula-theme` cookie. `null` when
	 * the user is on auto (or never chose) — client falls back to
	 * prefers-color-scheme in that case.
	 */
	theme: 'light' | 'dark' | null;
	/** Company line shown in PDF cover footer. Defaults to the brand name. */
	company: string;
}

const DEFAULTS = {
	name: 'Docs',
	color: '#2563eb',
	// Both variants are served by src/routes/api/branding/[file]/+server.ts
	// from content/branding/. The negative is optional — when missing, the
	// endpoint 404s and BrandLogo falls back to the positive logo.
	logoUrl: '/api/branding/logo.svg',
	logoNegativeUrl: '/api/branding/logo_negative.svg'
};

export function readBranding(themeCookie?: string): Branding {
	const name = (env.BRAND_NAME ?? '').trim() || DEFAULTS.name;
	const color = (env.BRAND_COLOR ?? '').trim() || DEFAULTS.color;
	// Explicit empty string disables the logo and falls back to text.
	const rawUrl = env.BRAND_LOGO_URL;
	const logoUrl = rawUrl === undefined ? DEFAULTS.logoUrl : rawUrl.trim() || null;
	const rawNeg = env.BRAND_LOGO_NEGATIVE_URL;
	const logoNegativeUrl =
		rawNeg === undefined ? DEFAULTS.logoNegativeUrl : rawNeg.trim() || null;
	const company = (env.BRAND_COMPANY ?? '').trim() || name;
	const theme: Branding['theme'] =
		themeCookie === 'light' || themeCookie === 'dark' ? themeCookie : null;
	return { name, color, logoUrl, logoNegativeUrl, theme, company };
}
