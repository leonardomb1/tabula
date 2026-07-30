import { readBranding } from '$lib/server/branding';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return { branding: readBranding() };
};
