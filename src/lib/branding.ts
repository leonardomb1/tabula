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
	/** Company line shown in PDF cover footer. Defaults to the brand name. */
	company: string;
}

const DEFAULTS = {
	name: 'Docs',
	color: '#2563eb',
	// Served by src/routes/api/branding/[file]/+server.ts from content/branding/
	logoUrl: '/api/branding/logo.svg'
};

export function readBranding(): Branding {
	const name = (env.BRAND_NAME ?? '').trim() || DEFAULTS.name;
	const color = (env.BRAND_COLOR ?? '').trim() || DEFAULTS.color;
	// Explicit empty string disables the logo and falls back to text.
	const rawUrl = env.BRAND_LOGO_URL;
	const logoUrl = rawUrl === undefined ? DEFAULTS.logoUrl : rawUrl.trim() || null;
	const company = (env.BRAND_COMPANY ?? '').trim() || name;
	return { name, color, logoUrl, company };
}
