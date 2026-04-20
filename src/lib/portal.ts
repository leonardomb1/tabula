/**
 * Svelte action — moves its node to `document.body` (or a named target) so
 * that `position: fixed` descendants anchor to the viewport, not to some
 * ancestor that created a containing block (ancestors with `transform`,
 * `filter`, `will-change`, `perspective`, `backdrop-filter`, `contain`).
 *
 * Used by the Search palette because it's rendered inside TopBar, whose
 * `will-change: transform` was clamping the palette-backdrop's `inset: 0`
 * to the top-bar's box instead of the full viewport.
 */
export function portal(node: HTMLElement, target: HTMLElement | string = document.body) {
	const host =
		typeof target === 'string'
			? (document.querySelector(target) as HTMLElement | null) ?? document.body
			: target;
	host.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
