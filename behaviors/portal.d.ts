/**
 * @module behaviors
 * Headless helpers to build styled components (one file each). Compose them: a
 * modal is `portal` + `trapFocus` + `dismissable`; a dropdown is `anchored` +
 * `dismissable` + `disclosure`. You bring the markup and CSS; they carry the
 * platform and a11y hard parts.
 */
/** Move `node` into `target` (default document.body); returns dispose(). */
export function portal(node: Node, target?: Node): () => void;
