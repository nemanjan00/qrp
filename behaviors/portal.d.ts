/**
 * @module behaviors
 * Headless helpers to build styled components (one file each, or the whole set
 * via the `@nemanjan00/qrp/behaviors` barrel): `portal`, `dismissable`,
 * `trapFocus`, `anchored`, `disclosure`, `busyWhile`, `embed` (host an
 * imperative widget — uPlot, canvas, xterm), `stickToBottom` (log/chat
 * autoscroll that lets go when the user scrolls up). Compose them: a modal is
 * `portal` + `trapFocus` + `dismissable`; a dropdown is `anchored` +
 * `dismissable` + `disclosure`. You bring the markup and CSS; they carry the
 * platform and a11y hard parts. UI built outside a render (a modal from an
 * onclick) should wrap its build in `scoped()` so its effects are owned.
 *
 * Each teardown-returning behavior (`portal`, `dismissable`, `trapFocus`,
 * `anchored`) also registers its undo with the current scope via `onDispose`, so
 * building them inside `scoped()`/`mount()` means `dispose()` alone tears down
 * effects AND behaviors — you don't have to collect the undos by hand. The undos
 * stay returned and are idempotent, so calling one manually is still fine.
 */
export interface PortalOptions {
	/**
	 * The node contexts should resolve through (see `context`). Defaults to the
	 * node's parent before the move; pass the trigger for detached content.
	 */
	owner?: Node;
}
/**
 * Move `node` into `target` (default document.body); returns an idempotent
 * dispose(). Also auto-registers teardown with the current scope. Contexts keep
 * resolving through where the node came from (or `options.owner`).
 */
export function portal(node: Node, target?: Node, options?: PortalOptions): () => void;
