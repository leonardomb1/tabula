/**
 * Shared state for the workspace switcher modal. Only the home page (`/`)
 * exposes a trigger — other pages just show a static breadcrumb — but the
 * modal itself mounts once at the layout level.
 *
 * `pulseKey` increments on each open() call so the trigger can replay a
 * pulse animation (keyed animations need a value change to retrigger).
 */

interface State {
	open: boolean;
	pulseKey: number;
}

export const workspaceModal = $state<State>({ open: false, pulseKey: 0 });

export function openWorkspaceModal(): void {
	workspaceModal.pulseKey += 1;
	workspaceModal.open = true;
}

export function closeWorkspaceModal(): void {
	workspaceModal.open = false;
}
