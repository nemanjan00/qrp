/**
 * @module host
 * Bridges for apps where qrp doesn't own the whole page: a layout library
 * (GridStack, golden-layout), another framework's router, a legacy shell (see
 * docs/LARGE-APPS.md). `island(parent, view, props)` mounts a qrp view into a
 * container someone else owns, with props pushed in through `update()`.
 * `reconcile(source, key, hooks)` keeps a keyed set of foreign widgets in sync
 * with a reactive list (create / update / recreate / destroy, one scope per
 * item). For the reverse direction, a foreign widget inside qrp DOM, see
 * `embed` in behaviors.
 */

export interface Island<P extends object> {
	/** The reactive props the view reads. */
	props: P;
	/** Write changed keys (Object.is) in one batch and delete missing ones. */
	update(next: P): void;
	/** Tear down the view's effects and clear its DOM. */
	dispose(): void;
}

/**
 * Mount `view(props)` into a container owned by something else, with reactive
 * props. `update(next)` re-runs only the bindings that read a changed key.
 * Created inside a scope (a component, `reconcile`'s `create`), it also
 * disposes with that scope.
 * @example
 * const panel = island(gridItemBody, (p) => el("h3", {}, () => p.title), { title: "CPU" });
 * panel.update({ title: "CPU %" });
 */
export function island<P extends object>(parent: HTMLElement, view: (props: P) => unknown, initial?: P): Island<P>;

export interface ReconcileHooks<T, H, K> {
	/** Build the foreign thing for a new key; runs in its own scope. Returns your handle. */
	create(item: T, key: K): H;
	/** The item under a key changed (per `equals`). */
	update?(handle: H, item: T, previous: T): void;
	/** A key went away (its scope is disposed right after). */
	destroy?(handle: H, key: K): void;
	/** Return true to destroy + create instead of update (e.g. the type changed). */
	recreate?(previous: T, item: T): boolean;
	/** Item equality (default Object.is). */
	equals?(previous: T, item: T): boolean;
}

export interface Reconciled<H, K> {
	/** A copy of the live handles by key. */
	handles(): Map<K, H>;
	/** Destroy every entry and stop tracking (also on scope dispose). */
	dispose(): void;
}

/**
 * Keep a keyed set of things qrp doesn't render (grid widgets, map layers,
 * dock panels) in sync with a reactive list, like `list()` does for DOM.
 * @example
 * reconcile(() => lab.panes, (p) => p.id, {
 *   create: (pane) => addWidget(pane),
 *   update: (w, pane) => w.panel.update({ pane }),
 *   recreate: (prev, next) => prev.type !== next.type,
 *   destroy: (w) => grid.removeWidget(w.item)
 * });
 */
export function reconcile<T, H, K = unknown>(
	source: () => readonly T[] | null | undefined,
	key: (item: T) => K,
	hooks: ReconcileHooks<T, H, K>
): Reconciled<H, K>;
