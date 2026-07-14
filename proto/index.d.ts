/** Walk obj's prototype chain; return the prototype named protoName, or undefined. */
export function findProto(obj: object, protoName: string): object | undefined;
/** Replace proto[method] with make(original), idempotently. Returns restore(). */
export function wrapMethod<T extends object>(proto: T, method: keyof T | string, make: (original: any) => any, tag?: string): () => void;
/** Wrap a fn so it runs at most once. */
export function onceOnly<F extends (...args: any[]) => any>(fn: F): (...args: Parameters<F>) => ReturnType<F> | undefined;
/** One-listener event delegation by CSS selector. Returns dispose(). */
export function delegate(root: Element | Document, selector: string, handler: (event: Event, match: Element) => void, type?: string): () => void;
