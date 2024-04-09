const ndapp = require("ndapp");
const { Command } = require("commander");

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

		const program = new Command();

		program
			.name(packageInfo.name)
			.version(packageInfo.version)
			.description("Application to download and store music in strong hierarchy");

		program.command("processLibrary")
			.description("Check all files and transform music library to strong format")
			.action(async (options, command) => {
				await app.libraryManager.processLibrary(app.uploadManager.uploaders[app.enums.UPLOADER_TYPES.DISK].info.root);
			});

		program.command("yandex")
			.description("Run browser to download music from Yandex.Music")
			.action(async (options, command) => {
				await app.browserManager.openBrowser();
				await app.browserManager.page.navigate("https://music.yandex.ru/");
			});

		program.parse();
	}
}

ndapp({
	app: new AppManager(),
	components: [
		() => new (require("./components/BrowserManager"))(),
		() => new (require("./components/LibraryManager"))(),
		() => new (require("./components/UploadManager"))(),
		() => new (require("./components/YandexMusicManager"))()
	],
	enums: {
		UPLOADER_TYPES: require("./constants/uploaderTypes")
	},
	tools: {
		urljoin: require("url-join"),
		nameCase: require("./tools/nameCase"),
		getFileInfosFromDirectory: require("./tools/getFileInfosFromDirectory"),
		filenamify: require("./tools/filenamify"),
		formatTrackNumber: require("./tools/formatTrackNumber")
	}
});
