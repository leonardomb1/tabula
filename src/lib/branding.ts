export const PRODUCT_NAME = 'Tabula';

export interface Branding {
	name: string;
	color: string;
	company: string;
	logoUrl: string | null;
	logoNegativeUrl: string | null;
}

export const DEFAULT_BRAND_NAME = PRODUCT_NAME;
export const DEFAULT_BRAND_COLOR = '#b4502f';
