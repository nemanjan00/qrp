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

	const recalc = () => {
		if(weights.length === 0) {
			weightMap = [];
			max = 0;

			return;
		}

		const min = Math.min(...weights);
		let pointer = 0;

		weightMap = weights.map((weight) => {
			pointer += weight / min;

			return pointer;
		});

		max = pointer;
	};

	return {
		push: (candidate, weight) => {
			candidates.push(candidate);
			weights.push(weight || 1);

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
