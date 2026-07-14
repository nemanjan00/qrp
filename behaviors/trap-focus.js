/**
 * behaviors/trap-focus.js — keep Tab focus inside a node, restore it on close.
 * The a11y-critical part of a modal/dialog.
 */

const FOCUSABLE = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex=\"-1\"])"
].join(",");

/**
 * Trap Tab/Shift+Tab within `node`, focus its first focusable (or the node),
 * and restore focus to the previously-focused element on dispose.
 *
 * @param {Element} node container to trap focus within
 * @returns {Function} dispose
 */
export const trapFocus = (node) => {
	const previouslyFocused = document.activeElement;

	const focusables = () => [...node.querySelectorAll(FOCUSABLE)];

	const onKey = (event) => {
		if(event.key !== "Tab") {
			return;
		}

		const items = focusables();

		if(items.length === 0) {
			event.preventDefault();

			return;
		}

		const first = items[0];
		const last = items[items.length - 1];

		if(event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if(!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	node.addEventListener("keydown", onKey);

	const initial = focusables()[0] || node;

	if(initial.focus) {
		initial.focus();
	}

	return () => {
		node.removeEventListener("keydown", onKey);

		if(previouslyFocused && previouslyFocused.focus) {
			previouslyFocused.focus();
		}
	};
};
