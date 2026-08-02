const dotenv = require("dotenv-flow");

dotenv.config({
	path: process.cwd()
});

const ndapp = require("ndapp");

const config = require("./config");
const packageInfo = require("./package.json");

const DEVELOPER_ENVIRONMENT = process.env.DEVELOPER_ENVIRONMENT === "true";

const name = ndapp.libs._.last(packageInfo.name.split("/"));
const version = packageInfo.version;

function getApplicationDataDirectory() {
	switch (process.platform) {
		case "darwin":
			return app.path.resolve(process.env.HOME, "Library", "Application Support");
		case "linux":
			return app.path.resolve(process.env.HOME, ".local", "share");
		case "win32":
			return app.path.resolve(process.env.APPDATA);
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

class AppManager extends ndapp.Application {
	constructor() {
		super();

		this.onUncaughtException = error => {
			const outputter = (app && app.log && app.log.error) ? app.log.error : console.error;
			outputter(error ? error.stack : "Unknown exception");
		};

		this.onUnhandledRejection = error => {
			const outputter = (app && app.log && app.log.error) ? app.log.error : console.error;
			outputter(error ? error.stack : "Unknown rejection");
		};
	}

	getUserDataPath(...paths) {
		return app.path.resolve(this.dataDirectory, "userData", ...paths);
	}

	getTempPath(...paths) {
		return app.path.resolve(app.getUserDataPath("temp", ...paths));
	}

	async initialize() {
		this.dataDirectory = app.path.resolve(getApplicationDataDirectory(), name);
		app.fs.ensureDirSync(this.dataDirectory);

		this.loadConfig();

		app.tools.mediaBufferCache.initialize();

		await super.initialize();
	}

	loadConfig() {
		app.configPath = app.path.resolve(this.dataDirectory, "config.json");

		let loaded = false;
		try {
			if (app.fs.existsSync(app.configPath)) {
				app.config = app.libs._.merge(config, app.tools.json.load(app.configPath));
				loaded = true;
			}
		} catch (_) {
			app.log.error(`Erron in config file at ${app.configPath}`);
		}

		if (!loaded) {
			app.config = config;

			app.tools.json.save(app.configPath, app.config);
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
	log: {
		file: DEVELOPER_ENVIRONMENT ? ndapp.path.resolve(process.cwd(), "log.txt") : false
	},
	components: [
		() => new (require("./components/LogsManager"))(),
		() => new (require("./components/CliCommandsManager"))(),
		() => new (require("./components/LibraryManager"))(),
		() => new (require("./components/UploadManager"))(),
		() => new (require("./components/browser/BrowserManager"))(),
		() => new (require("./components/yandexMusic/YandexMusicDownloadManager"))(),
		() => new (require("./components/bandcamp/BandcampDownloadManager"))(),
		() => new (require("./components/zvukCom/ZvukComDownloadManager"))()
	],
	enums: {
		MUSIC_SERVICE_TYPES: require("./constants/musicServiceTypes"),
		UPLOADER_TYPES: require("./constants/uploaderTypes")
	},
	constants: {
		DEVELOPER_ENVIRONMENT
	},
	tools: {
		urljoin: require("url-join"),

		filenamify: require("./tools/filenamify"),
		formatSize: require("./tools/formatSize"),
		formatTrackNumber: require("./tools/formatTrackNumber"),
		getFileInfosFromDirectory: require("./tools/getFileInfosFromDirectory"),
		hash: require("./tools/hash"),
		mediaBufferCache: require("./tools/MediaBufferCache"),
		nameCase: require("./tools/nameCase"),
		openDirectoryInExplorer: require("./tools/openDirectoryInExplorer"),
		retry: require("./tools/retry"),
		sleep: require("./tools/sleep")
	},
	specials: {
		name,
		version,
		packageInfo
	}
});
