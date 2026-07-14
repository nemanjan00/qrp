/**
 * Reactive facades over native browser APIs. Each returns reactive state and
 * registers its listeners via onDispose, so creating one inside a component
 * cleans up on unmount.
 */

/** localStorage-backed reactive state with cross-tab sync. */
export function persisted<T extends Record<string, any>>(storageKey: string, defaults?: T): T;

/** The URL query string as two-way reactive state. */
export function query(): Record<string, string>;

/** location.hash as reactive state: { hash }. Two-way. */
export function hashState(): { hash: string };

/** matchMedia as reactive state: { matches }. */
export function media(mediaQuery: string): { matches: boolean };

/** Reactive window size: { width, height }. */
export function viewport(): { width: number; height: number };

/** Reactive connectivity: { online }. */
export function online(): { online: boolean };

/** Reactive tab visibility: { visible }. */
export function visible(): { visible: boolean };

/** Poll a getter; fire callback when its value changes. Returns stop(). */
export function watch(getter: () => unknown, callback: (value: unknown) => void, interval?: number): () => void;

/** document.cookie as reactive, parsed state (polled). */
export function cookies(interval?: number): Record<string, string>;

/** IntersectionObserver as reactive state: { matches } (on screen). */
export function seen(element: Element, options?: IntersectionObserverInit): { matches: boolean };
