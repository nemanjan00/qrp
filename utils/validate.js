/**
 * utils/validate.js — a tiny declarative validator + coercer for form/PATCH
 * payloads.
 *
 * No zero-build browser story for joi/zod, and dashboards mostly need the basics:
 * required, type, min/max, pattern, enum, and a custom check. A schema is a map
 * of field → rule; `validate` returns `{ errors, value }` — `errors` is
 * `[{ path, message }]` (empty = ok) and `value` is a COERCED copy (form strings
 * become their declared type: "5"→5, "true"→true) so you can send `value`
 * straight as the patch. Checks run on the coerced value. Nested objects via
 * `fields` recurse.
 *
 *   const schema = {
 *     name:  { type: "string", required: true, min: 2 },
 *     age:   { type: "number", min: 0, max: 120 },   // "37" → 37
 *     active:{ type: "boolean" },                    // "true" → true
 *     role:  { enum: ["admin", "user"] },
 *     prefs: { fields: { theme: { enum: ["light", "dark"] } } }
 *   };
 *   const { errors, value } = validate(schema, payload);
 *   if (errors.length === 0) http.patch("/thing", value);   // value is coerced
 */

const typeOf = (value) => {
	if(Array.isArray(value)) {
		return "array";
	}

	if(value === null) {
		return "null";
	}

	return typeof value;
};

// Coerce a form-ish value toward its declared type (leaves it untouched if the
// coercion would be lossy/ambiguous). Only number and boolean — the two that
// arrive as strings from inputs; strings/objects/arrays pass through.
const coerce = (rule, value) => {
	if(value === undefined || value === null || value === "") {
		return value;
	}

	if(rule.type === "number" && typeof value === "string") {
		const n = Number(value);

		return value.trim() !== "" && Number.isFinite(n) ? n : value;
	}

	if(rule.type === "boolean" && typeof value === "string") {
		if(value === "true") {
			return true;
		}

		if(value === "false") {
			return false;
		}
	}

	return value;
};

const checkField = (path, rule, value, errors) => {
	// ABSENT (not sent) vs PRESENT-BUT-EMPTY ("") are different: an absent
	// optional field is skipped, but a "" that IS sent gets validated — so a
	// pattern/check can reject empty on an optional patch field. required fails
	// on either.
	const absent = value === undefined || value === null;

	if(rule.required && (absent || value === "")) {
		errors.push({ path, message: rule.message || `${path} is required` });

		return;
	}

	if(absent) {
		return;
	}

	if(rule.type && typeOf(value) !== rule.type) {
		errors.push({ path, message: rule.message || `${path} must be a ${rule.type}` });

		return;
	}

	if(rule.enum && !rule.enum.includes(value)) {
		errors.push({ path, message: rule.message || `${path} must be one of ${rule.enum.join(", ")}` });
	}

	if(rule.min !== undefined) {
		const size = typeof value === "string" || Array.isArray(value) ? value.length : value;

		if(size < rule.min) {
			errors.push({ path, message: rule.message || `${path} must be at least ${rule.min}` });
		}
	}

	if(rule.max !== undefined) {
		const size = typeof value === "string" || Array.isArray(value) ? value.length : value;

		if(size > rule.max) {
			errors.push({ path, message: rule.message || `${path} must be at most ${rule.max}` });
		}
	}

	if(rule.pattern && !rule.pattern.test(String(value))) {
		errors.push({ path, message: rule.message || `${path} is invalid` });
	}

	if(typeof rule.check === "function") {
		const result = rule.check(value);

		if(result !== true && result !== undefined) {
			errors.push({ path, message: result || rule.message || `${path} is invalid` });
		}
	}
};

// Build a coerced copy of `data` per `schema`, collecting errors on the way.
const walk = (schema, data, errors, prefix, strict) => {
	const out = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};

	Object.keys(schema).forEach((key) => {
		const rule = schema[key];
		const path = prefix + key;
		let value = (data || {})[key];

		if(rule.fields && value && typeof value === "object") {
			value = walk(rule.fields, value, errors, path + ".", strict);
		} else {
			value = coerce(rule, value);
		}

		if(value !== undefined) {
			out[key] = value;
		}

		checkField(path, rule, value, errors);
	});

	// strict: any data key the schema doesn't declare is an error (recursively).
	// Off by default so patches with pass-through keys keep working.
	if(strict && data && typeof data === "object") {
		Object.keys(data).forEach((key) => {
			if(!Object.prototype.hasOwnProperty.call(schema, key)) {
				errors.push({ path: prefix + key, message: `${prefix + key} is not an allowed key` });
			}
		});
	}

	return out;
};

/**
 * Validate + coerce `data` against `schema`.
 * @param {object} schema field → rule map
 * @param {object} data the object to check
 * @param {object} [options]
 * @param {boolean} [options.strict] reject keys not declared in the schema
 *   (recursively). Default false — unknown keys pass through into `value`.
 * @returns {{ errors: { path: string, message: string }[], value: object }}
 *   `errors` empty = valid; `value` is the coerced copy (send it as the patch).
 */
export const validate = (schema, data, options = {}) => {
	const errors = [];
	const value = walk(schema, data, errors, "", options.strict === true);

	return { errors, value };
};
