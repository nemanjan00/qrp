/**
 * behaviors/disclosure.js — open/close state with optional ARIA wiring.
 * Powers tabs, collapse, accordion, dropdown.
 */

import { state, effect } from "../qrp/index.js";

/**
 * Reactive open/close state. `d.state.open` is reactive; connect() wires a
 * trigger + panel (aria-expanded, hidden, click-to-toggle).
 *
 * @param {boolean} [initial] initial open state
 * @returns {object} { state, toggle, open, close, connect }
 */
export const disclosure = (initial = false) => {
	const self = state({ open: initial });

	return {
		state: self,

		toggle: () => { self.open = !self.open; },
		open: () => { self.open = true; },
		close: () => { self.open = false; },

		/**
		 * Wire a trigger button and a panel to this disclosure.
		 * @param {Element} trigger clickable toggle
		 * @param {Element} panel content shown when open
		 */
		connect: (trigger, panel) => {
			effect(() => {
				trigger.setAttribute("aria-expanded", String(self.open));
				panel.hidden = !self.open;
			});

			trigger.addEventListener("click", () => { self.open = !self.open; });
		}
	};
};
