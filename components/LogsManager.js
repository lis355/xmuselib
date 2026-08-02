module.exports = class LogsManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	log(log) {
		app.log.info(log);

		if (app.browserManager.page) {
			// NOTE don't await cause just logging
			app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: log => {
					let logger;
					if (window.originalFunctions &&
						window.originalFunctions.log) logger = window.originalFunctions.log;

					if (!logger) logger = console.log;

					logger(log);
				},
				args: [log]
			});
		}
	}
};
