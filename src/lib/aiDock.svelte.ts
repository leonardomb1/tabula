/**
 * Shared state for the right-side AI dock. Any top-bar can call toggleAi()
 * to slide the dock in/out; the dock component reads `aiDock.open` directly
 * and owns its own message state internally.
 *
 * Kept as a module-level $state rune so it survives route navigations
 * within a session. The dock mounts once in +layout.svelte.
 */
export const aiDock = $state({ open: false });

export function toggleAi(): void {
	aiDock.open = !aiDock.open;
}

export function openAi(): void {
	aiDock.open = true;
}

export function closeAi(): void {
	aiDock.open = false;
}
