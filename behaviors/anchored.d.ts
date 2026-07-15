export interface AnchoredOptions {
	placement?: "bottom" | "top";
	gap?: number;
	/** Size the floating element to the trigger's width (dropdown-spans-input). */
	matchWidth?: boolean;
}
export interface AnchoredDispose { (): void; update(): void; }
/**
 * Position `floating` next to `trigger`; returns an idempotent dispose() (with
 * .update()). Also auto-registers teardown with the current scope.
 */
export function anchored(trigger: Element, floating: HTMLElement, options?: AnchoredOptions): AnchoredDispose;
