/**
 * behaviors/portal.js — render a node into another container (default
 * document.body) so it escapes overflow/stacking contexts. For modals,
 * dropdowns, tooltips, popovers.
 */

import { onDispose } from "../qrp/index.js";

/**
 * Move `node` into `target` and return a dispose() that removes it again.
 * The teardown also registers with the current scope (`scope`/`scoped`/`mount`),
 * so disposing the owner removes the node too — no need to track the undo by
 * hand. The returned undo is idempotent (safe to also call manually).
 *
 * @param {Node} node element to relocate
 * @param {Node} [target] destination (default document.body)
 * @returns {Function} dispose
 */
export const portal = (node, target = document.body) => {
	target.appendChild(node);

	let done = false;
	const undo = () => {
		if(done) {
			return;
		}

		done = true;

		if(node.parentNode) {
			node.parentNode.removeChild(node);
		}
	};

	onDispose(undo);

	return undo;
};
