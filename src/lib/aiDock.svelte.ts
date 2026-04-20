/**
 * Shared state for the right-side AI dock. Any top-bar can call toggleAi()
 * to slide the dock in/out; the dock component reads `aiDock.open` directly
 * and owns its own message state internally.
 *
 * Kept as a module-level $state rune so it survives route navigations
 * within a session. The dock mounts once in +layout.svelte.
 */
export const aiDock = $state<{
	open: boolean;
	pendingQuery: string | null;
	/** When true, messages go through the agent endpoint (tool use enabled).
	 *  Default off — explicit opt-in so the AI only acts on workspace state
	 *  when the user has chosen to let it. */
	agentMode: boolean;
}>({
	open: false,
	pendingQuery: null,
	agentMode: false
});

export function toggleAi(): void {
	aiDock.open = !aiDock.open;
}

export function openAi(): void {
	aiDock.open = true;
}

export function closeAi(): void {
	aiDock.open = false;
}

/**
 * Open the dock with a pre-filled question. The dock consumes pendingQuery
 * once and resets it to null so the same handoff doesn't fire twice.
 */
export function openAiWith(query: string): void {
	aiDock.pendingQuery = query;
	aiDock.open = true;
}
