const ndapp = require("ndapp");
const filenamifyLibrary = require("filenamify");

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

	async initialize() {
		app.config = require("./config");

		try {
			app.libs._.merge(app.config, require("./config.local"));
		} catch (_) {
		}

		await super.initialize();
	}

	async run() {
		await super.run();
	}
}

ndapp({
	app: new AppManager(),
	components: [
		() => new (require("./components/BrowserManager"))(),
		() => new (require("./components/UploadManager"))(),
		() => new (require("./components/YandexMusicManager"))()
	],
	tools: {
		urljoin: require("url-join"),
		nameCase: require("./tools/nameCase"),
		filenamify: function (path) {
			return filenamifyLibrary(path, { maxLength: 1024 });
		}
	}
});
