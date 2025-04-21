const { Command } = require("commander");

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
			.action(this.yandexCommand.bind(this));

		program.command("bandcamp")
			.description("Run browser to download music from Bandcamp")
			.argument("[albums]", "Bandcamp album urls (comma separated)")
			.action(this.bandcampCommand.bind(this));

		// чтобы не закрывалось в разработке
		if (app.constants.DEVELOPER_ENVIRONMENT) {
			program.action(() => { });
		}

		program.parse();
	}

	async openConfigCommand() {
		await app.tools.openDirectoryInExplorer(app.path.win32.resolve(app.configPath));
	}

	async processLibraryCommand() {
		await app.libraryManager.processLibrary(app.uploadManager.uploaders[app.enums.UPLOADER_TYPES.DISK].info.root);
	}

	async yandexCommand(albums, options) {
		await app.yandexMusicDownloadManager.runAutomationDownloadAlbumsAndQuit({ albums });
	}

	async bandcampCommand(albums, options) {
		await app.bandcampDownloadManager.runAutomationDownloadAlbumsAndQuit({ albums });
	}
};
