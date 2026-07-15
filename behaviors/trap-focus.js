/**
 * behaviors/trap-focus.js — keep Tab focus inside a node, restore it on close.
 * The a11y-critical part of a modal/dialog.
 */

import { onDispose } from "../qrp/index.js";

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
 * and restore focus to the previously-focused element on dispose. The teardown
 * also registers with the current scope (`scope`/`scoped`/`mount`), so disposing
 * the owner restores focus — no need to track the undo by hand. The returned
 * undo is idempotent (safe to also call manually).
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

	let done = false;
	const undo = () => {
		if(done) {
			return;
		}

		done = true;
		node.removeEventListener("keydown", onKey);

		if(previouslyFocused && previouslyFocused.focus) {
			previouslyFocused.focus();
		}
	};

	onDispose(undo);

	return undo;
};
