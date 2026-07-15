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
/**
 * Validate + coerce data against a schema. `errors` is [] when valid; `value` is
 * a coerced copy (form strings become their declared type — "5"→5, "true"→true)
 * ready to send as the patch.
 */
export function validate(schema: Schema, data: any): ValidationResult;
