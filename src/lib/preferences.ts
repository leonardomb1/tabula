export type Theme = 'auto' | 'light' | 'dark';
export type ReadingFont = 'serif' | 'sans' | 'mono';

export const THEMES: Theme[] = ['auto', 'light', 'dark'];
export const READING_FONTS: ReadingFont[] = ['serif', 'sans', 'mono'];

const THEME_KEY = 'tabula-theme';
const FONT_KEY = 'tabula-font';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
	try {
		const v = localStorage.getItem(key) as T | null;
		return v && allowed.includes(v) ? v : fallback;
	} catch {
		return fallback;
	}
}

function persist(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
	}
}

export function getTheme(): Theme {
	return read(THEME_KEY, THEMES, 'auto');
}

export function setTheme(theme: Theme) {
	if (theme === 'auto') delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = theme;
	persist(THEME_KEY, theme);
}

export function getReadingFont(): ReadingFont {
	return read(FONT_KEY, READING_FONTS, 'serif');
}

export function setReadingFont(font: ReadingFont) {
	document.documentElement.dataset.font = font;
	persist(FONT_KEY, font);
}
