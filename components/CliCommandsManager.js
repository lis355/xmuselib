const { Command } = require("commander");
const YandexMusicAlbumDownloadAutomation = require("./yandexMusic/YandexMusicAlbumDownloadAutomation");

module.exports = class CliCommandsManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	async run() {
		await super.run();

		const program = new Command();

		program
			.name(app.packageInfo.name)
			.version(app.packageInfo.version)
			.description("Application to download and store music in strong hierarchy");

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

	async processLibraryCommand(options, command) {
		await app.libraryManager.processLibrary(app.uploadManager.uploaders[app.enums.UPLOADER_TYPES.DISK].info.root);
	}

	async yandexCommand(albums, options, command) {
		const automation = new YandexMusicAlbumDownloadAutomation({ albums, auto: options.auto });
		await automation.run();
	}
};
