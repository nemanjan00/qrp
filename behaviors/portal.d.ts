/** Move `node` into `target` (default document.body); returns dispose(). */
export function portal(node: Node, target?: Node): () => void;
