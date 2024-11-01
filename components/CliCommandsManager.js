const { Command } = require("commander");

const YandexMusicAlbumDownloadAutomation = require("./yandexMusic/YandexMusicAlbumDownloadAutomation");
const openDirectoryInExplorer = require("../tools/openDirectoryInExplorer");

module.exports = class CliCommandsManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	async run() {
		await super.run();

		const program = new Command();

		program
			.name(app.name)
			.version(app.version)
			.description(`Application to download and store music in strong hierarchy, [userData] located at ${app.getUserDataPath()}, [config] located at ${app.configPath}`);

		program.command("config")
			.description("Open config for manual editing")
			.action(this.openConfigCommand.bind(this));

		program.command("processLibrary")
			.description("Check all files and transform music library to strong format")
			.action(this.processLibraryCommand.bind(this));

		program.command("yandex")
			.description("Run browser to download music from Yandex.Music")
			.argument("[albums]", "Yandex.Music album urls or IDs (comma separated)")
			.option("--auto")
			.action(this.yandexCommand.bind(this));

		program.parse();
	}

	async openConfigCommand() {
		openDirectoryInExplorer(app.configPath);
	}

	async processLibraryCommand() {
		await app.libraryManager.processLibrary(app.uploadManager.uploaders[app.enums.UPLOADER_TYPES.DISK].info.root);
	}

	async yandexCommand(albums, options) {
		const automation = new YandexMusicAlbumDownloadAutomation({ albums, auto: options.auto });
		await automation.run();
	}
};
