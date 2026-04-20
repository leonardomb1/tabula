/**
 * Auto-hide a sticky top bar on downward scroll, reveal on upward scroll —
 * only on narrow viewports (where screen real estate matters). Listens on
 * `window` so it works with our current window-scroll layout; no app-level
 * scroller required.
 *
 * Usage (Svelte 5):
 *   <header use:autoHideOnScroll>…</header>
 *
 * The action adds / removes the `is-hidden` class on the element. CSS owns
 * the actual transform so easing stays consistent with the rest of the
 * design system.
 */

const DELTA = 6;        // px of movement before we act on a direction change
const SHOW_ZONE = 40;   // always-visible zone at the top of the document
const MOBILE_BP = 720;  // same breakpoint the mobile reader styles use

export function autoHideOnScroll(node: HTMLElement) {
	let lastY = window.scrollY;

	function onScroll() {
		if (window.innerWidth > MOBILE_BP) {
			if (node.classList.contains('is-hidden')) node.classList.remove('is-hidden');
			return;
		}
		const y = window.scrollY;
		const dy = y - lastY;
		if (y < SHOW_ZONE) {
			node.classList.remove('is-hidden');
		} else if (dy > DELTA) {
			node.classList.add('is-hidden');
		} else if (dy < -DELTA) {
			node.classList.remove('is-hidden');
		}
		lastY = y;
	}

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onScroll, { passive: true });

	return {
		destroy() {
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		}
	};
}
