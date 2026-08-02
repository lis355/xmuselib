const sleep = require("./sleep");

module.exports = async function retry(func, options = {}) {
	const maxRetries = options.maxRetries || 3;
	const retryDelayInMilliseconds = options.retryDelayInMilliseconds || 1000;
	const checkError = options.checkError || (() => true);

	let attempt = 0;
	while (true) {
		attempt++;

		try {
			const result = await func();

			return result;
		} catch (err) {
			if (attempt < maxRetries &&
				checkError(err)) {
				await sleep(retryDelayInMilliseconds);

				continue;
			}

			throw err;
		}
	}
};
