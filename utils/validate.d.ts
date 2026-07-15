export interface Rule {
	required?: boolean;
	type?: "string" | "number" | "boolean" | "object" | "array" | "null";
	enum?: any[];
	/** Number: value bound. String/array: length bound. */
	min?: number;
	max?: number;
	pattern?: RegExp;
	/** Return true/undefined for ok, or a string message for an error. */
	check?: (value: any) => true | string | undefined | void;
	/** Nested schema for object fields. */
	fields?: Schema;
	/** Override message for any failure on this field. */
	message?: string;
}
export type Schema = Record<string, Rule>;
export interface ValidationError { path: string; message: string; }
export interface ValidationResult { errors: ValidationError[]; value: any; }
export interface ValidateOptions {
	/** Reject keys not declared in the schema (recursively). Default false. */
	strict?: boolean;
}
/**
 * Validate + coerce data against a schema. `errors` is [] when valid; `value` is
 * a coerced copy (form strings become their declared type — "5"→5, "true"→true)
 * ready to send as the patch. `value` carries ALL keys of `data` — declared ones
 * coerced, undeclared ones passed through untouched — so it is never a partial
 * payload. A present-but-empty `""` is validated (so a
 * pattern/check can reject empty on an optional field); an absent (undefined/null)
 * optional field is skipped. Pass `{ strict: true }` to reject unknown keys.
 */
export function validate(schema: Schema, data: any, options?: ValidateOptions): ValidationResult;
