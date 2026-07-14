/**
 * @module behaviors
 * Headless helpers to build styled components (one file each, or the whole set
 * via the `@nemanjan00/qrp/behaviors` barrel): `portal`, `dismissable`,
 * `trapFocus`, `anchored`, `disclosure`, `busyWhile`. Compose them: a modal is
 * `portal` + `trapFocus` + `dismissable`; a dropdown is `anchored` +
 * `dismissable` + `disclosure`. You bring the markup and CSS; they carry the
 * platform and a11y hard parts. UI built outside a render (a modal from an
 * onclick) should wrap its build in `scoped()` so its effects are owned.
 */
/** Move `node` into `target` (default document.body); returns dispose(). */
export function portal(node: Node, target?: Node): () => void;
