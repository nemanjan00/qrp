/**
 * behaviors/dismissable.js — close-on-Escape and close-on-outside-click.
 */

/**
 * Call `onDismiss` when the user presses Escape or clicks outside `node`.
 * The outside-click listener is attached on the next tick so the same click
 * that opened the element doesn't immediately dismiss it.
 *
 * @param {Node} node the element considered "inside"
 * @param {Function} onDismiss called with the triggering event
 * @param {object} [options]
 * @param {boolean} [options.escape] listen for Escape (default true)
 * @param {boolean} [options.outside] listen for outside pointerdown (default true)
 * @returns {Function} dispose
 */
export const dismissable = (node, onDismiss, options = {}) => {
	const escape = options.escape !== false;
	const outside = options.outside !== false;

	const onKey = (event) => {
		if(escape && event.key === "Escape") {
			onDismiss(event);
		}
	};

	const onPointer = (event) => {
		if(outside && !node.contains(event.target)) {
			onDismiss(event);
		}
	};

	document.addEventListener("keydown", onKey, true);

	// Defer so the opening click isn't caught as an outside click.
	const timer = setTimeout(() => {
		document.addEventListener("pointerdown", onPointer, true);
	}, 0);

	return () => {
		clearTimeout(timer);
		document.removeEventListener("keydown", onKey, true);
		document.removeEventListener("pointerdown", onPointer, true);
	};
};
