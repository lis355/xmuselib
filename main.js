const ndapp = require("ndapp");

// TODO сделать свою либу для ID3
// node-id3 либа почему то игнорирует неопределенные для нее тэги
const ID3Definitions = require("node-id3/src/ID3Definitions");
ID3Definitions.FRAME_IDENTIFIERS.v3.compilation = "TCMP";
ID3Definitions.FRAME_IDENTIFIERS.v4.compilation = "TCMP";
ID3Definitions.FRAME_INTERNAL_IDENTIFIERS.v3.TCMP = "compilation";
ID3Definitions.FRAME_INTERNAL_IDENTIFIERS.v4.TCMP = "compilation";

const packageInfo = require("./package.json");

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
		app.config = CONFIG;

		try {
			app.libs._.merge(app.config, require("./config"));
		} catch (_) {
		}
	}

	async run() {
		await super.run();
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
	tools: {
		urljoin: require("url-join"),
		filenamify: require("./tools/filenamify"),
		formatTrackNumber: require("./tools/formatTrackNumber"),
		getFileInfosFromDirectory: require("./tools/getFileInfosFromDirectory"),
		hash: require("./tools/hash"),
		nameCase: require("./tools/nameCase")
	},
	specials: {
		packageInfo
	}
});
