/**
 * Shared state bridge between the /new editor and the AI dock.
 *
 * The dock is mounted at layout level; the editor lives on `/new` and
 * owns a CodeMirror buffer that isn't reflected in any load data. When
 * the user asks the agent to "edit this document" on /new, we want:
 *
 *   1. The agent to read from the *live* buffer, not the saved file on
 *      disk — the user may have unsaved changes.
 *   2. The accept path to update the *buffer*, not overwrite the saved
 *      file — saving is still the user's explicit Ctrl+S action.
 *
 * Both sides are decoupled through this module: /new registers its
 * buffer + an `applyEdit` callback on mount (and keeps content fresh
 * on every keystroke); the dock reads from here and calls `applyEdit`
 * when a proposed edit is accepted.
 *
 * `applyEdit` is a function rather than a state value so the editor
 * can respond in the most direct way possible (dispatching a
 * CodeMirror transaction) without leaking its internals to the dock.
 */

interface EditorBridge {
	/** Slug being edited — matches `?edit=<slug>` / originalSlug when known.
	 *  `null` when editing a new draft with no slug yet. */
	slug: string | null;
	/** Workspace id the draft belongs to. */
	wsId: string | null;
	/** Live CodeMirror buffer contents — updated on every keystroke. */
	content: string;
	/** Whole-buffer replace. Fallback when inline diff review isn't
	 *  available (editor not mounted, or viewer/public contexts). */
	applyEdit: ((newContent: string) => void | Promise<void>) | null;
	/** Preferred path when the editor is mounted: opens the inline unified
	 *  diff view inside CodeMirror so the user can accept or reject each
	 *  hunk individually. Resolves when the user exits review (via the
	 *  Concluir button) — the final buffer state is whatever they
	 *  accepted/rejected. */
	startDiffReview: ((newContent: string) => Promise<void>) | null;
	/** True while an inline review session is active. Lets the dock gate
	 *  its accept button on "not already reviewing something else". */
	reviewActive: boolean;
}

export const editorBridge = $state<EditorBridge>({
	slug: null,
	wsId: null,
	content: '',
	applyEdit: null,
	startDiffReview: null,
	reviewActive: false
});

export function registerEditor(init: {
	slug: string | null;
	wsId: string | null;
	content: string;
	applyEdit: (newContent: string) => void | Promise<void>;
	startDiffReview?: (newContent: string) => Promise<void>;
}): void {
	editorBridge.slug = init.slug;
	editorBridge.wsId = init.wsId;
	editorBridge.content = init.content;
	editorBridge.applyEdit = init.applyEdit;
	editorBridge.startDiffReview = init.startDiffReview ?? null;
	editorBridge.reviewActive = false;
}

export function updateEditorContent(content: string): void {
	editorBridge.content = content;
}

export function setReviewActive(active: boolean): void {
	editorBridge.reviewActive = active;
}

export function unregisterEditor(): void {
	editorBridge.slug = null;
	editorBridge.wsId = null;
	editorBridge.content = '';
	editorBridge.applyEdit = null;
	editorBridge.startDiffReview = null;
	editorBridge.reviewActive = false;
}
