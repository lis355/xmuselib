const { Command } = require("commander");

const { MUSIC_SERVICE_TYPES } = app.enums;

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

		program.command("download")
			.alias("d")
			.alias("down")
			.description("Download music from Yandex.Music (with browser), from Bandcamp")
			.argument("[albums]", "Yandex.Music album urls, Bandcamp album urls (comma or space separated)")
			.action(this.downloadCommand.bind(this));

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

	async downloadCommand(_1, _2, command) {
		let albumUrls = [];
		command.args.forEach(arg => albumUrls.push(...arg.split(",")));
		albumUrls = Array.from(new Set(albumUrls.map(url => url.trim()).filter(Boolean)));

		const urlsByServices = {
			[MUSIC_SERVICE_TYPES.YANDEX]: [],
			[MUSIC_SERVICE_TYPES.BANDCAMP]: []
		};

		albumUrls.forEach(albumUrl => {
			let url;
			try {
				url = new URL(albumUrl.toLowerCase());
			} catch (error) {
				throw new Error(`Bad url ${albumUrl}`);
			}

			if (url.host.includes("yandex")) {
				// "https://music.yandex.ru/album/NUMBER_ID"
				if (!/https:\/\/music\.yandex\.ru\/album\/[1-9][0-9]*/.test(url.href)) throw new Error(`Bad url ${albumUrl}`);

				urlsByServices[MUSIC_SERVICE_TYPES.YANDEX].push(url);
			} else if (url.host.includes("bandcamp")) {
				// "https://***.bandcamp.com/album/***"
				if (!/https:\/\/[^/]+\.bandcamp\.com\/album\/[^/]+/.test(url.href)) throw new Error(`Bad url ${albumUrl}`);

				urlsByServices[MUSIC_SERVICE_TYPES.BANDCAMP].push(url);
			} else throw new Error(`Bad url ${albumUrl}`);
		});

		if (urlsByServices[MUSIC_SERVICE_TYPES.YANDEX].length > 0) await app.yandexMusicDownloadManager.downloadAlbums({ urls: urlsByServices[MUSIC_SERVICE_TYPES.YANDEX] });
		if (urlsByServices[MUSIC_SERVICE_TYPES.BANDCAMP].length > 0) await app.bandcampDownloadManager.downloadAlbums({ urls: urlsByServices[MUSIC_SERVICE_TYPES.BANDCAMP] });

		app.quit();
	}
};
