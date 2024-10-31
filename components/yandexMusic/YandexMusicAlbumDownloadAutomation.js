const {
	click,
	waitForSelector
} = require("./pageUtils");

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
			await this.runAutomationDownloadAlbums();

			app.quit();
		}
	}

	async runAutomationDownloadAlbums() {
		app.yandexMusicBrowserManager.events
			.on("albumInfoCreated", albumInfo => {
				if (this.albumUrl.includes(albumInfo.info.id.toString())) {
					this.albumInfo = albumInfo;
				}
			})
			.on("trackInfoCreated", trackInfo => {
			})
			.on("albumCoverDowloaded", albumInfo => {
				this.albumCoverDowloadedPromiseResolve();
				this.albumCoverDowloadedPromiseResolve = null;
			})
			.on("trackDowloaded", trackInfo => {
				this.trackDowloadedPromiseResolve();
				this.trackDowloadedPromiseResolve = null;
			})
			.on("albumUploadingStarted", albumInfo => {
			})
			.on("albumUploadingFinished", trackInfo => {
				this.albumUploadingFinishedPromiseResolve();
				this.albumUploadingFinishedPromiseResolve = null;
			});

		for (const albumUrl of this.albumUrls) {
			this.albumUrl = albumUrl;

			await app.browserManager.page.navigate(this.albumUrl);

			await waitForSelector({
				page: app.browserManager.page,
				selector: ".entity-cover"
			});

			await waitForSelector({
				page: app.browserManager.page,
				selector: ".d-track[data-item-id]"
			});

			for (let i = 0; i < this.albumInfo.info.trackCount; i++) {
				await Promise.all([
					click({
						page: app.browserManager.page,
						selector: `.d-track[data-item-id='${this.albumInfo.info.trackIds[i]}'] button.button-play`
					}),
					new Promise(resolve => {
						this.trackDowloadedPromiseResolve = resolve;
					})
				]);
			}

			await Promise.all([
				click({
					page: app.browserManager.page,
					selector: "img.entity-cover__image"
				}),
				new Promise(resolve => {
					this.albumCoverDowloadedPromiseResolve = resolve;
				})
			]);

			await new Promise(resolve => {
				this.albumUploadingFinishedPromiseResolve = resolve;
			});
		}
	}
};
