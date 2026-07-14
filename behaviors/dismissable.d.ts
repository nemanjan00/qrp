export interface DismissableOptions { escape?: boolean; outside?: boolean; }
/** Call onDismiss on Escape or outside pointerdown; returns dispose(). */
export function dismissable(node: Node, onDismiss: (event: Event) => void, options?: DismissableOptions): () => void;
