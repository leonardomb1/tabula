/**
 * Drag-to-close for bottom/top-anchored sheets. Attach to the sheet root and
 * point `handle` at a selector inside it (the grabber bar, typically). Pointer
 * events on anything outside the handle are ignored so inner scroll and taps
 * keep working.
 *
 * The action mutates `transform` inline while dragging, then either calls
 * `onClose` if the user pulled past a threshold / flicked fast enough, or
 * snaps back to the rest position. CSS owns the base transform via the
 * `.is-open` class, so we toggle `data-dragging` to suspend the transition
 * during the drag and remove our inline style on release.
 */
interface Opts {
	anchor: 'bottom' | 'top';
	onClose: () => void;
	/** CSS selector for the drag handle inside the sheet. */
	handle: string;
	/** Set from the parent's `open` state — the action is a no-op when false. */
	enabled: boolean;
}

export function swipeToClose(node: HTMLElement, opts: Opts) {
	let current = opts;
	let pointerId: number | null = null;
	let startY = 0;
	let startT = 0;
	let lastY = 0;
	let lastT = 0;

	function onPointerDown(e: PointerEvent) {
		if (!current.enabled) return;
		const target = e.target as HTMLElement | null;
		if (!target?.closest(current.handle)) return;
		pointerId = e.pointerId;
		startY = lastY = e.clientY;
		startT = lastT = e.timeStamp;
		node.setAttribute('data-dragging', '');
		node.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (pointerId !== e.pointerId) return;
		lastY = e.clientY;
		lastT = e.timeStamp;
		const dy = e.clientY - startY;
		// Clamp so the sheet can only move in the closing direction. A tiny
		// overpull in the wrong direction feels nicer than a hard stop.
		const clamped =
			current.anchor === 'bottom' ? Math.max(dy, -12) : Math.min(dy, 12);
		node.style.transform = `translateY(${clamped}px)`;
	}

	function release() {
		if (pointerId === null) return;
		const dy = lastY - startY;
		const dt = Math.max(lastT - startT, 1);
		const velocity = dy / dt; // px/ms; positive = downward
		const pullPast = 80;
		const flick = 0.6;

		const shouldClose =
			current.anchor === 'bottom'
				? dy > pullPast || velocity > flick
				: dy < -pullPast || velocity < -flick;

		node.removeAttribute('data-dragging');
		node.style.transform = '';
		pointerId = null;
		if (shouldClose) current.onClose();
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', release);
	node.addEventListener('pointercancel', release);

	return {
		update(next: Opts) {
			current = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', release);
			node.removeEventListener('pointercancel', release);
		}
	};
}
