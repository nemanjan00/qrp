export interface AnchoredOptions {
	placement?: "bottom" | "top";
	gap?: number;
	/** Size the floating element to the trigger's width (dropdown-spans-input). */
	matchWidth?: boolean;
}
export interface AnchoredDispose { (): void; update(): void; }
/** Position `floating` next to `trigger`; returns dispose() (with .update()). */
export function anchored(trigger: Element, floating: HTMLElement, options?: AnchoredOptions): AnchoredDispose;
