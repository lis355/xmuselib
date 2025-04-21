const MAX_DEFAULT_WAITING_TIME_IN_SECONDS = 30;
const ITERATION_COOLDOWN_IN_SECONDS = 0.5;
const ITERATION_COOLDOWN_MINIMUM_IN_SECONDS = 0.1;

async function hasSelector(options) {
	const page = options.page;
	const frame = options.frame || page.mainFrame;
	const selector = options.selector;

	// if (app.isDevelop) {
	// 	app.log.info(`hasSelector ${selector}`);
	// }

	try {
		const result = await page.evaluateInFrame({
			frame,
			func: options => Boolean(window.document.querySelector(options.selector)),
			args: [{ selector }]
		});

		return result;
	} catch (error) {
		app.libs._.assign(error.data, {
			selector
		});

		throw error;
	}
}

async function click(options) {
	const page = options.page;
	const frame = options.frame || page.mainFrame;
	const selector = options.selector;
	const skipIfNoElement = Boolean(options.skipIfNoElement);

	// if (app.isDevelop) {
	// 	app.log.info(`click ${selector}`);
	// }

	const hasElement = await hasSelector(options);
	if (hasElement) {
		try {
			await page.evaluateInFrame({
				frame,
				func: options => window.document.querySelector(options.selector).click(),
				args: [{ selector }]
			});
		} catch (error) {
			app.libs._.assign(error.data, {
				selector
			});

			throw error;
		}
	} else if (!skipIfNoElement) {
		throw new Error(`Element ${selector} not found`);
	}
}

async function waitForSelector(options) {
	const page = options.page;
	const frame = options.frame || page.mainFrame;
	const selector = options.selector;
	const iterationCooldown = 1000 * (options.cooldown || ITERATION_COOLDOWN_IN_SECONDS);
	const timeout = options.timeout || MAX_DEFAULT_WAITING_TIME_IN_SECONDS;
	const throwError = options.throwError !== undefined ? options.throwError : true;
	// const infinitely = options.infinitely;

	// if (app.isDevelop) {
	// 	app.log.info(`waitForSelector ${selector} timeout=${timeout} infinitely=${infinitely}`);
	// }

	const timer = new app.tools.time.Timer();
	let exists = false;
	do {
		exists = await hasSelector({ page, frame, selector });

		if (exists) {
			break;
		} else if (timer.time() > timeout) {
			if (throwError) throw new Error(`Element ${selector} not found after ${timeout} seconds`);

			// if (!infinitely)

			break;
		}

		await app.tools.delay(iterationCooldown);
	} while (true);
}

// Вызывает asyncCallback, пока он возвращает true (или не вышло время)
async function doWhile(asyncCallback, options) {
	options = options || {};
	const iterationCooldown = 1000 * (options.cooldown || ITERATION_COOLDOWN_IN_SECONDS);
	const timeout = options.timeout || MAX_DEFAULT_WAITING_TIME_IN_SECONDS;
	const throwError = options.throwError !== undefined ? options.throwError : true;

	// if (app.isDevelop) {
	// 	app.log.info(`doWhile ${asyncCallback.toString()} timeout=${timeout}`);
	// }

	const timer = new app.tools.time.Timer();
	let result = false;
	do {
		try {
			result = await asyncCallback();
		} catch (callbackError) {
			app.libs._.assign(callbackError.data, {
				iterationCooldown,
				timeout,
				throwError
			});

			throw callbackError;
		}

		if (!result) {
			break;
		} else if (timer.time() > timeout) {
			if (throwError) throw new Error(`Timeout after ${timeout} seconds`);

			break;
		}

		await app.tools.delay(iterationCooldown);
	} while (true);
}

module.exports = {
	ITERATION_COOLDOWN_MINIMUM_IN_SECONDS,

	click,
	doWhile,
	hasSelector,
	waitForSelector
};
