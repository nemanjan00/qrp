/**
 * store/index.js — plumbing for an app-wide store that mirrors a server: merge
 * snapshots without re-running untouched bindings, keep capped feeds, and turn
 * a high-rate stream into a steady, batched trickle of writes.
 *
 *   const lab = state({ devices: [], panes: [], activity: [], live: {} });
 *   live.on("state", (msg) => assign(lab, msg.state));
 *   live.on("activity", (msg) => append(lab.activity, msg.entry, 500));
 *   const values = coalesce(lab.live, { interval: 250 });
 *   live.on("samples", (msg) => values.set(msg.name, msg.last));
 */

import { batch, onDispose, raw } from "../qrp/index.js";

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Reads through state() return proxies; compare the underlying objects so an
// unchanged array or object passed back in counts as unchanged.
const same = (a, b) => Object.is(raw(a), raw(b));

/**
 * Merge `patch` into a reactive `target` in one batch, writing only the keys
 * whose value changed (`Object.is`) — so effects bound to untouched keys don't
 * re-run on every snapshot. With `{ prune: true }`, keys missing from the patch
 * are deleted (a full snapshot rather than a partial update).
 *
 * @param {object} target a state() object
 * @param {object} patch plain values to write
 * @param {object} [options]
 * @param {boolean} [options.prune] delete target keys the patch doesn't have
 * @returns {string[]} the keys that changed
 */
export const assign = (target, patch, options = {}) => batch(() => {
	const written = Object.keys(patch).filter((key) => !has(target, key) || !same(target[key], patch[key]));

	written.forEach((key) => {
		target[key] = patch[key];
	});

	const pruned = options.prune ? Object.keys(target).filter((key) => !has(patch, key)) : [];

	pruned.forEach((key) => {
		delete target[key];
	});

	return written.concat(pruned);
});

/**
 * Append item(s) to a reactive array and drop the oldest past `max` — an
 * activity feed, a chat log, the last N events. One push and at most one
 * splice, inside a batch, so a list() over it reconciles once.
 *
 * @param {Array} array a reactive array (e.g. `store.activity`)
 * @param {*|Array} items one item, or an array of items
 * @param {number} [max] keep at most this many (default: unbounded)
 * @returns {Array} the array
 */
export const append = (array, items, max = Infinity) => batch(() => {
	const added = Array.isArray(items) ? items : [items];

	array.push(...added);

	if(array.length > max) {
		array.splice(0, array.length - max);
	}

	return array;
});

/**
 * Buffer high-rate writes and apply them to `target` at a fixed rate: the
 * latest value per key wins, a flush is one batch, and unchanged values are
 * skipped. A 1 kHz sample stream becomes one render every `interval` ms, no
 * matter how many keys move. Nothing runs while nothing is pending. Stops with
 * the enclosing scope (pending values are dropped).
 *
 * @param {object} target a state() object
 * @param {object} [options]
 * @param {number|string} [options.interval] ms between flushes (default 250),
 *   or "frame" to flush on the next animation frame
 * @returns {object} { set(key, value), flush(), dispose() }
 */
export const coalesce = (target, options = {}) => {
	const interval = options.interval === undefined ? 250 : options.interval;
	const pending = new Map();
	let timer = null;
	let disposed = false;

	const cancel = () => {
		if(timer === null) {
			return;
		}

		if(interval === "frame") {
			cancelAnimationFrame(timer);
		} else {
			clearTimeout(timer);
		}

		timer = null;
	};

	const flush = () => {
		cancel();

		if(!pending.size) {
			return;
		}

		const patch = Object.fromEntries(pending);

		pending.clear();
		assign(target, patch);
	};

	const schedule = () => {
		if(timer !== null || disposed) {
			return;
		}

		timer = interval === "frame" ? requestAnimationFrame(flush) : setTimeout(flush, interval);
	};

	const dispose = () => {
		disposed = true;
		cancel();
		pending.clear();
	};

	onDispose(dispose);

	return {
		/** Queue a value; it lands on `target[key]` at the next flush. */
		set: (key, value) => {
			if(disposed) {
				return;
			}

			pending.set(key, value);
			schedule();
		},

		/** Apply everything pending now. */
		flush,

		/** Stop: cancel the pending flush and drop queued values. */
		dispose
	};
};
