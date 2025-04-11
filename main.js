#!/usr/bin/env node

const ndapp = require("ndapp");

const packageInfo = require("./package.json");

const DEVELOPER_ENVIRONMENT = process.env.DEVELOPER_ENVIRONMENT === "true";

const CONFIG = {
	acronyms: [],
	upload: [
		// {
		// 	type: "fs",
		// 	root: ROOT_FOLDER
		// },
		// {
		// 	type: "ftp",
		// 	host: "HOST",
		// 	port: PORT,
		// 	root: "/ROOT_FOLDER"
		// }
	]
};

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
		this.loadConfig();

		await super.initialize();
	}

	loadConfig() {
		app.configPath = app.path.resolve(__dirname, "config.js");
		app.config = CONFIG;

		try {
			app.libs._.merge(app.config, require(app.configPath));
		} catch (_) {
		}
	}

	async run() {
		await super.run();

		if (app.constants.DEVELOPER_ENVIRONMENT) {
			try {
				const onRunFilePath = app.path.resolve(__dirname, "onRun.js");
				if (app.fs.existsSync(onRunFilePath)) await (require(onRunFilePath))();
			} catch (error) {
				console.error(error);
			}
		}
	}
}

ndapp({
	app: new AppManager(),
	components: [
		() => new (require("./components/BrowserManager"))(),
		() => new (require("./components/CliCommandsManager"))(),
		() => new (require("./components/LibraryManager"))(),
		() => new (require("./components/UploadManager"))(),
		() => new (require("./components/yandexMusic/YandexMusicBrowserManager"))()
	],
	enums: {
		UPLOADER_TYPES: require("./constants/uploaderTypes")
	},
	constants: {
		DEVELOPER_ENVIRONMENT
	},
	tools: {
		urljoin: require("url-join"),

		filenamify: require("./tools/filenamify"),
		formatTrackNumber: require("./tools/formatTrackNumber"),
		getFileInfosFromDirectory: require("./tools/getFileInfosFromDirectory"),
		hash: require("./tools/hash"),
		nameCase: require("./tools/nameCase"),
		openDirectoryInExplorer: require("./tools/openDirectoryInExplorer")
	},
	specials: {
		name: ndapp.libs._.last(packageInfo.name.split("/")),
		version: packageInfo.version
	}
});
