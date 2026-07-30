export function clickOutside(node: HTMLElement, callback: () => void) {
	function onClick(e: MouseEvent) {
		if (node && !node.contains(e.target as Node)) callback();
	}
	document.addEventListener('click', onClick);
	return {
		destroy() {
			document.removeEventListener('click', onClick);
		}
	};
}
