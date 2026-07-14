/**
 * limit.js — rate-limit an async function three ways: parallelism, throughput,
 * and per-call timeout.
 *
 * The capabilities of `queue-promised`'s `wrapper(fn, opts)` — max concurrent
 * calls, max starts per second, and a per-call timeout — distilled into a single
 * dependency-free function (no uuid / global registry / worker pool a browser
 * dashboard doesn't need). Same observable behavior: excess calls queue FIFO,
 * each call returns a Promise.
 *
 *   const fetchOne = limit(id => http.get(`/accounts/${id}`), 5);        // 5 at a time
 *   const poll     = limit(fn, { max: 2, perSecond: 10, timeout: 4000 }); // + rate + timeout
 *   ids.map(fetchOne);
 *
 * `timeout` rejects the call with `Error("timeout")` if it hasn't settled in
 * time (the underlying work can't be cancelled — a Promise never can — it's just
 * no longer awaited), mirroring `queue-promised`'s `maxTime`.
 */

/**
 * @typedef {object} LimitOptions
 * @property {number} [max] max concurrent in-flight calls (default 1)
 * @property {number} [perSecond] max calls STARTED per second (default: unlimited)
 * @property {number} [timeout] per-call timeout in ms (default: none)
 */

const withTimeout = (promise, ms) => {
	if(!ms) {
		return promise;
	}

	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout")), ms);

		promise.then(resolve, reject).finally(() => clearTimeout(timer));
	});
};

/**
 * @param {(...args: any[]) => any} fn a function (usually async / returns a Promise)
 * @param {number|LimitOptions} [options] concurrency number, or an options object
 * @returns {(...args: any[]) => Promise<any>} same signature, rate-limited
 */
export const limit = (fn, options = 1) => {
	const opts = typeof options === "number" ? { max: options } : options;
	const max = opts.max || 1;
	const minGap = opts.perSecond ? 1000 / opts.perSecond : 0;
	const timeoutMs = opts.timeout;

	let active = 0;
	let lastStart = 0;
	let rateTimer = null;
	const queue = [];

	const pump = () => {
		if(active >= max || queue.length === 0) {
			return;
		}

		// throughput cap: keep at least minGap ms between starts
		if(minGap) {
			const wait = minGap - (Date.now() - lastStart);

			if(wait > 0) {
				if(rateTimer === null) {
					rateTimer = setTimeout(() => { rateTimer = null; pump(); }, wait);
				}

				return;
			}
		}

		active += 1;
		lastStart = Date.now();

		const job = queue.shift();

		// defer to a microtask so a synchronous throw in fn rejects the promise
		withTimeout(Promise.resolve().then(() => fn(...job.args)), timeoutMs)
			.then(job.resolve, job.reject)
			.finally(() => {
				active -= 1;
				pump();
			});

		// try to fill the remaining concurrency slots (each re-checks the gates)
		pump();
	};

	return (...args) => new Promise((resolve, reject) => {
		queue.push({ args, resolve, reject });
		pump();
	});
};
