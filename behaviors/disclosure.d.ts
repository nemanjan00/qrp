export interface Disclosure {
	state: { open: boolean };
	toggle(): void;
	open(): void;
	close(): void;
	connect(trigger: Element, panel: HTMLElement): void;
}
/** Reactive open/close state with optional ARIA wiring. */
export function disclosure(initial?: boolean): Disclosure;
