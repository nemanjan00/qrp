export interface DismissableOptions { escape?: boolean; outside?: boolean; }
/**
 * Call onDismiss on Escape or outside pointerdown; returns an idempotent
 * dispose(). Also auto-registers teardown with the current scope.
 *
 * **Guarantee:** the outside-pointerdown listener attaches on the *next tick*,
 * so the same interaction that opened the element (the click on a "…" menu, an
 * "edit" button spawning an inline editor) never counts as an outside click and
 * self-dismisses it. Rely on this — no `stopPropagation` needed at the opener.
 */
export function dismissable(node: Node, onDismiss: (event: Event) => void, options?: DismissableOptions): () => void;
