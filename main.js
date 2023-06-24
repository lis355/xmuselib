const ndapp = require("ndapp");
const filenamifyLibrary = require("filenamify");
// const { Command } = require("commander");

// const package = require("./package.json");

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

		// const program = new Command();

		// program
		// 	.name(package.name)
		// 	// .description()
		// 	.version(package.version);

		// program.command("checkLibrary")
		// 	.description("Split a string into substrings and display as an array")
		// 	.argument("<string>", "string to split")
		// 	.option("--first", "display just the first substring")
		// 	.option("-s, --separator <char>", "separator character", ",")
		// 	.action((str, options) => {
		// 		const limit = options.first ? 1 : undefined;
		// 		console.log(str.split(options.separator, limit));
		// 	});

		// program.command("yandex")
		// 	.description("Split a string into substrings and display as an array")
		// 	.argument("<string>", "string to split")
		// 	.option("--first", "display just the first substring")
		// 	.option("-s, --separator <char>", "separator character", ",")
		// 	.action((str, options) => {
		// 		const limit = options.first ? 1 : undefined;
		// 		console.log(str.split(options.separator, limit));
		// 	});

		// program.parse();

		await app.libraryManager.processLibrary(app.uploadManager.uploaders[app.enums.UPLOADER_TYPES.DISK].info.root);

		// await app.browserManager.openBrowser();
		// await app.browserManager.page.navigate(app.tools.urljoin("https://music.yandex.ru/album", String(app.config.yandexAlbumId)));
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
		filenamify: function (path) {
			return filenamifyLibrary(path, { maxLength: 1024, replacement: " " });
		}
	}
});
