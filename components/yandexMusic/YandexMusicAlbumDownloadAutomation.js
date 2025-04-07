module.exports = class YandexMusicAlbumDownloadAutomation {
	constructor(options) {
		this.isAutomation = app.libs._.get(options, "auto", false);

		if (this.isAutomation) {
			this.albumUrls = app.libs._.get(options, "albums")
				.split(",")
				.map(albumUrl => {
					albumUrl = albumUrl.trim();

					if (Number.isFinite(Number(albumUrl))) return `https://music.yandex.ru/album/${albumUrl}`;
					if (albumUrl.startsWith("https://music.yandex.ru/album/")) return albumUrl;

					throw new Error(`Invalid album url ${albumUrl}`);
				});
		}
	}

	async run() {
		await app.browserManager.openBrowser();

		if (!this.isAutomation) {
			await app.browserManager.page.navigate("https://music.yandex.ru/");
		} else {
			await app.yandexMusicBrowserManager.runAutomationDownloadAlbums(this.albumUrls);

			app.quit();
		}
	}
};
