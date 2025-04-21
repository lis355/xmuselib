module.exports = class LogsManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	log(log) {
		app.log.info(log);

		if (app.browserManager.page) {
			// NOTE pass promise cause just logging
			app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: log => console.log(log),
				args: [log]
			});
		}
	}
};
