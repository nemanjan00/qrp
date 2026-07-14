/**
 * utils/validate.js — a tiny declarative validator for form/PATCH payloads.
 *
 * No zero-build browser story for joi/zod, and dashboards mostly need the basics:
 * required, type, min/max, pattern, enum, and a custom check. A schema is a map
 * of field → rule; `validate` returns an array of { path, message } (empty = ok).
 * Nested objects validate recursively via `fields`.
 *
 *   const schema = {
 *     name:  { type: "string", required: true, min: 2 },
 *     age:   { type: "number", min: 0, max: 120 },
 *     email: { type: "string", pattern: /@/, message: "needs an @" },
 *     role:  { enum: ["admin", "user"] },
 *     prefs: { fields: { theme: { enum: ["light", "dark"] } } }
 *   };
 *   const errors = validate(schema, payload);   // [] when valid
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

const checkField = (path, rule, value, errors) => {
	const missing = value === undefined || value === null || value === "";

	if(rule.required && missing) {
		errors.push({ path, message: rule.message || `${path} is required` });

		return;
	}

	// absent-and-optional: nothing else to check
	if(missing) {
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

	if(rule.fields && value && typeof value === "object") {
		walk(rule.fields, value, errors, path + ".");
	}
};

const walk = (schema, data, errors, prefix) => {
	Object.keys(schema).forEach((key) => {
		checkField(prefix + key, schema[key], (data || {})[key], errors);
	});
};

/**
 * Validate `data` against `schema`. Returns [{ path, message }] — empty if valid.
 * @param {object} schema field → rule map
 * @param {object} data the object to check
 * @returns {{ path: string, message: string }[]}
 */
export const validate = (schema, data) => {
	const errors = [];

	walk(schema, data, errors, "");

	return errors;
};
