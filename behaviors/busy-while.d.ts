export interface BusyWhile {
	state: { pending: number };
	run<T>(promise: Promise<T>): Promise<T>;
	readonly active: boolean;
}
/** Track in-flight promises as reactive busy state (spinners/overlays). */
export function busyWhile(): BusyWhile;
