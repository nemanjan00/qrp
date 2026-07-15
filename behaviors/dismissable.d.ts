export interface DismissableOptions { escape?: boolean; outside?: boolean; }
/**
 * Call onDismiss on Escape or outside pointerdown; returns an idempotent
 * dispose(). Also auto-registers teardown with the current scope.
 */
export function dismissable(node: Node, onDismiss: (event: Event) => void, options?: DismissableOptions): () => void;
