const ndapp = require("ndapp");

const CLIArguments = require("./sider/CLIArguments");
const sider = require("./sider");

class AppManager extends ndapp.Application {
	constructor() {
		super();

		const errorHandler = error => {
			app.log.error(error.stack);
		};

		this.onUncaughtException = errorHandler;
		this.onUnhandledRejection = errorHandler;
	}

	async initialize() {
		const args = new CLIArguments();

		args.parseArrayArguments([
			"--start-maximized",
			"--restore-last-session"
		]);

		args.set("--user-data-dir", app.getUserDataPath("browserData"));

		args.set("--auto-open-devtools-for-tabs");

		this.browser = new sider.Browser({});

		await this.browser.launch({
			executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
			args
		});

		this.browser.on("closed", () => {
			app.quit();
		});

		await this.browser.initialize();

		await super.initialize();
	}

	getUserDataPath(...paths) {
		return app.path.resolve(__dirname, "userData", ...paths);
	}

	get db() {
		return app.localDbManager.db;
	}
}

ndapp({
	app: new AppManager(),
	components: [
		() => new (require("./LocalDbManager"))(),
		() => new (require("./YandexMusicManager"))()
	]
});
