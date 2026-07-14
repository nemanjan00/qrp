/**
 * utils/weighted-pool.js — a weighted random picker with runtime add/remove.
 */

/**
 * A pool of candidates each with a weight; pick() returns one at random with
 * probability proportional to weight. Pass a numeric seed for deterministic
 * selection. Add/remove candidates at runtime.
 *
 * @returns {object} pool with push/delete/pick/all
 */
export const weightedPool = () => {
	let candidates = [];
	let weights = [];

	let weightMap = [];
	let max = 0;

	// Cumulative RAW weights (no min-normalization, which broke weight 0 and
	// negatives). A candidate's slice is [prev, prev+weight); weight 0 yields an
	// empty slice → never picked. `max` is the total weight.
	const recalc = () => {
		let pointer = 0;

		weightMap = weights.map((weight) => {
			pointer += weight;

			return pointer;
		});

		max = pointer;
	};

	return {
		push: (candidate, weight) => {
			// undefined defaults to 1; 0 is a valid "never pick"; negatives are
			// nonsense for a probability weight.
			const w = weight === undefined ? 1 : weight;

			if(w < 0 || Number.isNaN(w)) {
				throw new Error("weightedPool: weight must be >= 0");
			}

			candidates.push(candidate);
			weights.push(w);

			recalc();
		},

		delete: (candidate) => {
			const index = candidates.indexOf(candidate);

			if(index === -1) {
				return;
			}

			candidates = candidates.filter((_, i) => i !== index);
			weights = weights.filter((_, i) => i !== index);

			recalc();
		},

		pick: (seed) => {
			if(candidates.length === 0) {
				return undefined;
			}

			const pointer = seed === undefined ? Math.random() * max : (seed % max);
			const index = weightMap.findIndex((cap) => pointer < cap);

			return candidates[index];
		},

		all: () => candidates.slice()
	};
};
