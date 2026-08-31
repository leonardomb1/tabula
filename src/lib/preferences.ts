export type Theme = 'auto' | 'light' | 'dark';
export type ReadingFont =
	| 'serif'
	| 'literata'
	| 'merriweather'
	| 'lora'
	| 'sans'
	| 'inter'
	| 'source-sans'
	| 'open-sans'
	| 'roboto'
	| 'lato'
	| 'noto-sans'
	| 'atkinson'
	| 'mono'
	| 'jetbrains-mono';

export const THEMES: Theme[] = ['auto', 'light', 'dark'];
/** Serifs first, then sans, then mono; rendering rules live in app.css ([data-font]). */
export const READING_FONTS: ReadingFont[] = [
	'serif',
	'literata',
	'merriweather',
	'lora',
	'sans',
	'inter',
	'source-sans',
	'open-sans',
	'roboto',
	'lato',
	'noto-sans',
	'atkinson',
	'mono',
	'jetbrains-mono'
];

/** For font-picker previews; keep in sync with the [data-font] rules in app.css. */
export const READING_FONT_FAMILIES: Record<ReadingFont, string> = {
	serif: 'var(--font-serif-read)',
	literata: "'Literata Variable', Georgia, serif",
	merriweather: "'Merriweather Variable', Georgia, serif",
	lora: "'Lora Variable', Georgia, serif",
	sans: 'var(--font-ui)',
	inter: "'Inter Variable', system-ui, sans-serif",
	'source-sans': "'Source Sans 3 Variable', system-ui, sans-serif",
	'open-sans': "'Open Sans Variable', system-ui, sans-serif",
	roboto: "'Roboto Variable', system-ui, sans-serif",
	lato: "'Lato', system-ui, sans-serif",
	'noto-sans': "'Noto Sans Variable', system-ui, sans-serif",
	atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
	mono: 'var(--font-mono)',
	'jetbrains-mono': "'JetBrains Mono Variable', monospace"
};

/** Proper-noun labels; serif/sans/mono get localized labels in the UI instead. */
export const READING_FONT_NAMES: Partial<Record<ReadingFont, string>> = {
	literata: 'Literata',
	merriweather: 'Merriweather',
	lora: 'Lora',
	inter: 'Inter',
	'source-sans': 'Source Sans 3',
	'open-sans': 'Open Sans',
	roboto: 'Roboto',
	lato: 'Lato',
	'noto-sans': 'Noto Sans',
	atkinson: 'Atkinson Hyperlegible',
	'jetbrains-mono': 'JetBrains Mono'
};

export const READING_SIZES = [14, 15, 16, 17, 18, 19, 20, 22];
export const DEFAULT_READING_SIZE = 17;
export const READING_WIDTHS = [40, 46, 54, 64, 76, 90];
export const DEFAULT_READING_WIDTH = 46;

const THEME_KEY = 'tabula-theme';
const FONT_KEY = 'tabula-font';
const SIZE_KEY = 'tabula-size';
const WIDTH_KEY = 'tabula-width';
const RAIL_KEY = 'tabula-rail';

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

function readStep(key: string, steps: number[], fallback: number): number {
	try {
		const v = parseInt(localStorage.getItem(key) ?? '', 10);
		return steps.includes(v) ? v : fallback;
	} catch {
		return fallback;
	}
}

export function getReadingSize(): number {
	return readStep(SIZE_KEY, READING_SIZES, DEFAULT_READING_SIZE);
}

export function setReadingSize(size: number) {
	document.documentElement.style.setProperty('--read-size', `${size}px`);
	persist(SIZE_KEY, String(size));
}

export function getReadingWidth(): number {
	return readStep(WIDTH_KEY, READING_WIDTHS, DEFAULT_READING_WIDTH);
}

export function getRailOpen(): boolean {
	try {
		return localStorage.getItem(RAIL_KEY) !== 'closed';
	} catch {
		return true;
	}
}

export function setRailOpen(open: boolean) {
	if (open) delete document.documentElement.dataset.rail;
	else document.documentElement.dataset.rail = 'closed';
	persist(RAIL_KEY, open ? 'open' : 'closed');
}

export function setReadingWidth(width: number) {
	document.documentElement.style.setProperty('--read-width', `${width}rem`);
	persist(WIDTH_KEY, String(width));
}
