/**
 * host/index.js — bridges for apps where qrp doesn't own the whole page: a
 * layout library (GridStack, golden-layout, a docking manager), a router from
 * another framework, a legacy shell. Two directions:
 *
 *   island(parent, view, props)   a qrp view inside a container someone else
 *                                 owns, with props you push in from outside
 *   reconcile(source, key, hooks) keep a keyed set of foreign widgets (grid
 *                                 items, map layers, tabs) in sync with state
 *
 * The reverse direction — a foreign widget inside qrp DOM — is `embed()` in
 * behaviors.
 */

import { batch, effect, mount, onDispose, raw, scope, state, untracked } from "../qrp/index.js";

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Reads through state() return proxies; compare the underlying objects so an
// unchanged array or object passed back in counts as unchanged.
const same = (a, b) => Object.is(raw(a), raw(b));

/**
 * Mount `view(props)` into `parent` with reactive props. `props` is a state()
 * object the view reads like any other (`() => props.config.title`), so
 * `update(next)` re-renders only the bindings that read a changed key. Keys
 * missing from `next` are deleted. `dispose()` tears down the view's effects
 * and DOM; created inside a scope (a component, reconcile's `create`), the
 * island also disposes with it. The adapter for "the layout library calls mount/update/destroy on
 * my panel".
 *
 *   const panel = island(gridItemBody, (p) => chartView(p), { config });
 *   panel.update({ config: nextConfig });
 *   panel.dispose();
 *
 * @param {HTMLElement} parent container owned by someone else
 * @param {Function} view (props) => renderable
 * @param {object} [initial] initial props
 * @returns {object} { props, update(next), dispose() }
 */
export const island = (parent, view, initial = {}) => {
	const props = state({ ...initial });
	const mounted = mount(parent, () => view(props));

	// a nested mount() isn't adopted by the scope it's created in: register it,
	// so an island built in reconcile's create() goes away with its entry
	onDispose(mounted.dispose);

	return {
		props,

		update: (next) => batch(() => {
			Object.keys(next)
				.filter((key) => !has(props, key) || !same(props[key], next[key]))
				.forEach((key) => {
					props[key] = next[key];
				});
			Object.keys(props)
				.filter((key) => !has(next, key))
				.forEach((key) => {
					delete props[key];
				});
		}),

		dispose: mounted.dispose
	};
};

/**
 * Keep a keyed set of things qrp doesn't render — grid widgets, map layers,
 * dock panels — in sync with a reactive list, the way `list()` does for DOM.
 * For each key that appears, `create(item, key)` runs inside its own scope (so
 * any effects or islands it builds are owned per item); when the item under a
 * key changes, `update(handle, item, previous)` runs, or the entry is rebuilt
 * if `recreate(previous, item)` says so; when a key disappears, `destroy(handle,
 * key)` runs and its scope is disposed. Hooks run untracked: only `source()` is
 * a dependency. Disposing the enclosing scope (or the returned handle)
 * destroys every entry.
 *
 *   reconcile(() => lab.panes.filter(onActiveTab), (p) => p.id, {
 *     create: (pane) => addGridWidget(pane),        // returns your handle
 *     update: (widget, pane) => widget.panel.update({ pane }),
 *     recreate: (prev, next) => prev.type !== next.type,
 *     destroy: (widget) => grid.removeWidget(widget.item)
 *   });
 *
 * @param {Function} source () => Array (reactive)
 * @param {Function} key item => stable id
 * @param {object} hooks
 * @param {Function} hooks.create (item, key) => handle
 * @param {Function} [hooks.update] (handle, item, previous) => void, called when
 *   the item under a key is a different value (`equals`)
 * @param {Function} [hooks.destroy] (handle, key) => void
 * @param {Function} [hooks.recreate] (previous, item) => boolean — destroy and
 *   create again instead of update (e.g. the widget's type changed)
 * @param {Function} [hooks.equals] (previous, item) => boolean, default Object.is
 * @returns {object} { handles(): Map<key, handle>, dispose() }
 */
export const reconcile = (source, key, hooks) => {
	const equals = hooks.equals || Object.is;
	const entries = new Map();

	const build = (item, id) => {
		let handle;
		const owner = scope(() => {
			handle = hooks.create(item, id);
		});

		entries.set(id, { item, handle, owner });
	};

	const remove = (id) => {
		const entry = entries.get(id);

		entries.delete(id);

		if(hooks.destroy) {
			hooks.destroy(entry.handle, id);
		}

		entry.owner.dispose();
	};

	const sync = (items) => {
		const seen = new Set();

		items.forEach((item) => {
			const id = key(item);

			if(seen.has(id)) {
				console.warn(`qrp reconcile: duplicate key ${String(id)} — later item ignored`);
				return;
			}

			seen.add(id);

			const entry = entries.get(id);

			if(!entry) {
				build(item, id);
			} else if(hooks.recreate && hooks.recreate(entry.item, item)) {
				remove(id);
				build(item, id);
			} else if(!equals(entry.item, item)) {
				const previous = entry.item;

				entry.item = item;

				if(hooks.update) {
					hooks.update(entry.handle, item, previous);
				}
			}
		});

		[...entries.keys()].filter((id) => !seen.has(id)).forEach(remove);
	};

	const runner = effect(() => {
		const items = source() || [];

		untracked(() => sync(items));
	}, { name: "reconcile" });

	const dispose = () => {
		runner.dispose();
		[...entries.keys()].forEach(remove);
	};

	// Entries are built untracked, so no effect owns their scopes: tie them to
	// the enclosing scope (or effect) explicitly.
	onDispose(dispose);

	return {
		/** The live handles by key (a copy). */
		handles: () => new Map([...entries].map(([id, entry]) => [id, entry.handle])),
		dispose
	};
};
