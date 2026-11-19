export interface StickToBottomOptions {
	/** Pixels from the bottom that still count as "at the bottom" (default 24). */
	threshold?: number;
}

export interface StickToBottom {
	/** Reactive: true while the view follows new content. */
	pinned: { value: boolean };
	/** Scroll to the newest content and pin again. */
	scrollToBottom(): void;
	/** Stop following (idempotent; also runs when the enclosing scope disposes). */
	dispose(): void;
}

/**
 * Keep a log/chat/feed scroller at the bottom as content arrives — but only
 * while the user is at the bottom; scrolling up to read history unpins it.
 */
export function stickToBottom(scroller: HTMLElement, options?: StickToBottomOptions): StickToBottom;
