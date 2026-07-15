/**
 * Trap Tab focus within node, focus its first focusable, restore on dispose.
 * Returns an idempotent dispose(); also auto-registers teardown with the scope.
 */
export function trapFocus(node: Element): () => void;
