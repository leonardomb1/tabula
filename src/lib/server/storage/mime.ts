const MIME: Record<string, string> = {
	md: 'text/markdown; charset=utf-8',
	typ: 'text/x-typst; charset=utf-8',
	txt: 'text/plain; charset=utf-8',
	json: 'application/json; charset=utf-8',
	html: 'text/html; charset=utf-8',
	css: 'text/css; charset=utf-8',
	svg: 'image/svg+xml',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	pdf: 'application/pdf',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	otf: 'font/otf'
};

export function contentTypeFor(key: string): string {
	const dot = key.lastIndexOf('.');
	if (dot === -1) return 'application/octet-stream';
	const ext = key.slice(dot + 1).toLowerCase();
	return MIME[ext] ?? 'application/octet-stream';
}
