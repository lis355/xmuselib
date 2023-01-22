const ndapp = require("ndapp");

class AppManager extends ndapp.Application {
	constructor() {
		super();

		const errorHandler = error => {
			app.log.error(error.stack);
		};

		this.onUncaughtException = errorHandler;
		this.onUnhandledRejection = errorHandler;
	}

	getUserDataPath(...paths) {
		return app.path.resolve(__dirname, "userData", ...paths);
	}

	get db() {
		return app.localDbManager.db;
	}

	// async initialize() {
	// 	await super.initialize();
	// }

	async run() {
		await super.run();

		app.config = require("./config");

		try {
			app.libs._.merge(app.config, require("./config.local"));
		} catch (_) {
		}

		await app.browserManager.page.navigate(app.config.startUrl);
	}
}

ndapp({
	app: new AppManager(),
	components: [
		() => new (require("./components/LocalDbManager"))(),
		() => new (require("./components/BrowserManager"))(),
		() => new (require("./components/YandexMusicManager"))()
	],
	tools: {
		nameCase: require("./tools/nameCase")
	}
});
