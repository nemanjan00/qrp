/**
 * @module toasts
 * Notifications driven by the global bus — any code raises one without importing
 * the UI. `notify.success|error|info|warning(content)` where content is any
 * renderable. Mount the singleton once: `mount(document.body, toasts.component)`.
 */
import type { Renderable } from "../qrp/index.js";
import type { Emitter } from "../events/index.js";

export type Variant = "success" | "error" | "info" | "warning";

export interface ToastMeta {
	title?: string;
}

export interface ToastsOptions {
	bus?: Emitter;
	/** Auto-dismiss delay in ms (0 = sticky). */
	timeout?: number;
	/** Identical-message suppression window in ms. */
	dedupeWindow?: number;
}

export interface ToastsController {
	/** Mount this once near the root: mount(document.body, toasts.component). */
	component: (view: HTMLElement) => void;
	store: { items: any[] };
	push(variant: Variant | string, content: Renderable, meta?: ToastMeta): void;
	dismiss(id: number): void;
	success(content: Renderable, meta?: ToastMeta): void;
	error(content: Renderable, meta?: ToastMeta): void;
	info(content: Renderable, meta?: ToastMeta): void;
	warning(content: Renderable, meta?: ToastMeta): void;
}

/** Create a toast controller wired to an emitter. */
export function createToasts(options?: ToastsOptions): ToastsController;

/** The default toast controller wired to the global bus. */
export const toasts: ToastsController;

/** Fire-and-forget notifications through the global bus. Content is renderable. */
export const notify: {
	success(content: Renderable): void;
	error(content: Renderable): void;
	info(content: Renderable): void;
	warning(content: Renderable): void;
};
