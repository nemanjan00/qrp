/**
 * behaviors/stick-to-bottom.js — keep a log / chat / activity feed scrolled to
 * the newest entry while the user is reading the bottom, and leave them alone
 * once they scroll up to read history.
 */

import { onDispose, state } from "../qrp/index.js";

/**
 * Follow new content at the bottom of `scroller`. "Pinned" means the user is
 * within `threshold` px of the bottom; content added (any descendant change)
 * or a shrinking scroller keeps a pinned view at the bottom, an unpinned one
 * where it is. `pinned.value` is reactive — show a "jump to latest" button
 * while it's false. Also disposes with the enclosing scope.
 *
 * @param {HTMLElement} scroller the overflow:auto element
 * @param {object} [options]
 * @param {number} [options.threshold] px from the bottom that still counts as pinned (default 24)
 * @returns {object} { pinned: { value }, scrollToBottom(), dispose() }
 */
export const stickToBottom = (scroller, options = {}) => {
	const threshold = options.threshold === undefined ? 24 : options.threshold;
	const pinned = state({ value: true });

	const atBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= threshold;

	const scrollToBottom = () => {
		scroller.scrollTop = scroller.scrollHeight;
		pinned.value = true;
	};

	const follow = () => {
		if(pinned.value) {
			scroller.scrollTop = scroller.scrollHeight;
		}
	};

	const onScroll = () => {
		const next = atBottom();

		if(pinned.value !== next) {
			pinned.value = next;
		}
	};

	const mutations = new MutationObserver(follow);
	const resizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(follow);

	scroller.addEventListener("scroll", onScroll, { passive: true });
	mutations.observe(scroller, { childList: true, subtree: true, characterData: true });

	if(resizes) {
		resizes.observe(scroller);
	}

	let done = false;
	const dispose = () => {
		if(done) {
			return;
		}

		done = true;
		scroller.removeEventListener("scroll", onScroll);
		mutations.disconnect();

		if(resizes) {
			resizes.disconnect();
		}
	};

	onDispose(dispose);
	follow();

	return { pinned, scrollToBottom, dispose };
};
