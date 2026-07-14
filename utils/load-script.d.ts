/** Reactive load state for a lazily-injected script. */
export interface ScriptStatus {
	ready: boolean;
	error: unknown;
	/** Resolves when the script loads (non-enumerable; not a reactive key). */
	readonly promise: Promise<void>;
}
/** Inject a UMD/global <script> once (deduped by URL); returns reactive load state. */
export function loadScript(url: string, attrs?: Record<string, string>): ScriptStatus;
