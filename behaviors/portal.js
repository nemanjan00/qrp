/**
 * behaviors/portal.js — render a node into another container (default
 * document.body) so it escapes overflow/stacking contexts. For modals,
 * dropdowns, tooltips, popovers.
 */

/**
 * Move `node` into `target` and return a dispose() that removes it again.
 *
 * @param {Node} node element to relocate
 * @param {Node} [target] destination (default document.body)
 * @returns {Function} dispose
 */
export const portal = (node, target = document.body) => {
	target.appendChild(node);

	return () => {
		if(node.parentNode) {
			node.parentNode.removeChild(node);
		}
	};
};
