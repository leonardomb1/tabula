import { DEFAULT_BRAND_COLOR, DEFAULT_BRAND_NAME, type Branding } from '../branding';

const DEFAULT_LOGO = '/api/branding/logo.svg';
const DEFAULT_LOGO_NEGATIVE = '/api/branding/logo_negative.svg';

export function readBranding(): Branding {
	const name = process.env.BRAND_NAME?.trim() || DEFAULT_BRAND_NAME;
	const color = sanitizeColor(process.env.BRAND_COLOR) || DEFAULT_BRAND_COLOR;
	const company = process.env.BRAND_COMPANY?.trim() || name;

	const logoUrl = resolveLogo(process.env.BRAND_LOGO_URL, DEFAULT_LOGO);
	const logoNegativeUrl = resolveLogo(process.env.BRAND_LOGO_NEGATIVE_URL, DEFAULT_LOGO_NEGATIVE);

	return { name, color, company, logoUrl, logoNegativeUrl };
}

function resolveLogo(value: string | undefined, fallback: string): string | null {
	if (value === undefined) return fallback;
	return value.trim() || null;
}

function sanitizeColor(value: string | undefined): string {
	return (value ?? '').trim().replace(/[^#a-zA-Z0-9(),.%\s-]/g, '');
}
