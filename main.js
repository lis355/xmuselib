const ndapp = require("ndapp");

const config = require("./config");
const packageInfo = require("./package.json");

const DEVELOPER_ENVIRONMENT = process.env.DEVELOPER_ENVIRONMENT === "true";

const name = ndapp.libs._.last(packageInfo.name.split("/"));
const version = packageInfo.version;

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
		return app.path.resolve(this.dataDirectory, "userData", ...paths);
	}

	async initialize() {
		this.dataDirectory = app.path.resolve(process.env.APPDATA, name);
		app.fs.ensureDirSync(this.dataDirectory);

		this.loadConfig();

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
	components: [
		() => new (require("./components/LogsManager"))(),
		() => new (require("./components/CliCommandsManager"))(),
		() => new (require("./components/LibraryManager"))(),
		() => new (require("./components/UploadManager"))(),
		() => new (require("./components/browser/BrowserManager"))(),
		() => new (require("./components/yandexMusic/YandexMusicDownloadManager"))(),
		() => new (require("./components/bandcamp/BandcampDownloadManager"))()
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
		formatTrackNumber: require("./tools/formatTrackNumber"),
		getFileInfosFromDirectory: require("./tools/getFileInfosFromDirectory"),
		hash: require("./tools/hash"),
		nameCase: require("./tools/nameCase"),
		openDirectoryInExplorer: require("./tools/openDirectoryInExplorer")
	},
	specials: {
		name,
		version,
		packageInfo
	}
});
