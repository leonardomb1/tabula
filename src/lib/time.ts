const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function intlLocale(locale: string): string {
	const [lang, region] = locale.split('-');
	return region ? `${lang}-${region.toUpperCase()}` : lang;
}

export function relativeTime(value: Date | string, locale: string): string {
	const date = typeof value === 'string' ? new Date(value) : value;
	const diff = date.getTime() - Date.now();
	const abs = Math.abs(diff);
	const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
		numeric: 'always',
		style: 'narrow'
	});

	if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
	if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
	if (abs < WEEK) return rtf.format(Math.round(diff / DAY), 'day');
	if (abs < MONTH) return rtf.format(Math.round(diff / WEEK), 'week');
	if (abs < YEAR) return rtf.format(Math.round(diff / MONTH), 'month');
	return rtf.format(Math.round(diff / YEAR), 'year');
}

export function formatDate(value: Date | string, locale: string): string {
	const date = typeof value === 'string' ? new Date(value) : value;
	return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long' }).format(date);
}
