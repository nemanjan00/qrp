/**
 * behaviors/busy-while.js — a reactive busy flag around in-flight promises.
 * Drives spinners / overlays / skeletons for arbitrary async work (the
 * generic cousin of http.loading).
 */

import { state } from "../qrp/index.js";

/**
 * Track how many promises are in flight. `b.state.pending` is a reactive
 * count; `b.active` is true while any are pending.
 *
 * @returns {object} { state, run, active }
 */
export const busyWhile = () => {
	const self = state({ pending: 0 });

	return {
		state: self,

		/**
		 * Wrap a promise so it counts toward busy while it settles.
		 * @param {Promise} promise
		 * @returns {Promise} the same promise
		 */
		run: (promise) => {
			self.pending += 1;

			return Promise.resolve(promise).finally(() => {
				self.pending -= 1;
			});
		},

		// Reactive when read inside an effect().
		get active() {
			return self.pending > 0;
		}
	};
};
