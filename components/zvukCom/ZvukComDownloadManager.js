const { CoverInfo, TrackInfo, AlbumInfo, getTrackInfoText, getAlbumInfoText } = require("../entities/EntityInfos");
const { updateTagsInTrackInfoBuffer } = require("../../tools/tags");
const { hasSelector, waitForSelector } = require("../browser/pageUtils");
const JpegBufferImage = require("../../tools/JpegBufferImage");

class ZvukComCoverInfo extends CoverInfo {
	constructor(url, entityInfo) {
		super();

		this.url = url;
		this.entityInfo = entityInfo;

		this.buffer = null;
	}
}

class ZvukComTrackInfo extends TrackInfo {
	constructor({ albumInfo, id, artist, name, trackNumber, url, extension }) {
		super(albumInfo, trackNumber);

		this.id = id;
		this.artist = app.tools.nameCase(artist);
		this.name = app.tools.nameCase(name);
		this.url = url;

		this.buffer = null;
		this.extension = extension;
	}
}

class ZvukComAlbumInfo extends AlbumInfo {
	constructor({ id, coverUrl, artist, name, genre, year, isCompilation = false }) {
		super();

		this.id = id;

		this.cover = new ZvukComCoverInfo(coverUrl, this);

		this.artist = app.tools.nameCase(artist);
		this.name = app.tools.nameCase(name);
		this.genre = app.tools.nameCase(genre);
		this.year = year;
		this.isCompilation = isCompilation;

		this.trackInfos = [];
	}
}

module.exports = class ZvukComDownloadManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		app.browserManager.events.on("opened", this.handleBrowserManagerOnOpened.bind(this));
		app.browserManager.events.on("response", this.handleBrowserManagerOnResponse.bind(this));
	}

	async isLogined() {
		if (await hasSelector({ page: app.browserManager.page, selector: "[class*=ProfileDropdown_avatarImageAnimated]" })) return true;

		return false;
	}

	async handleBrowserManagerOnOpened() {
		function f() {
			window.originalFunctions = {
				log: window.console.log.bind(window.console),
				fetch: window.fetch.bind(window)
			};

			window.arrayBufferToBase64String = function (arrayBuffer) {
				const uint8arr = new Uint8Array(arrayBuffer);
				const arr = new Array(uint8arr.length);
				for (let i = 0; i < uint8arr.length; i++) arr[i] = String.fromCharCode(uint8arr[i]);

				const str = arr.join("");
				const base64Str = btoa(str);

				return base64Str;
			};
		}

		await app.browserManager.page.evaluateOnNewDocument(`(${f.toString()})();`);
	}

	async handleBrowserManagerOnResponse(params) {
		if (params.request.url.includes("zvuk.com/api/v1/graphql") &&
			params.request.method === "POST" &&
			params.request.hasPostData) {
			const postData = JSON.parse(params.request.postData);
			if (postData.operationName === "getStream") {
				const json = await app.browserManager.page.network.getResponseJson(params);
				if (this.waitForGetStreamResponseResolve) this.waitForGetStreamResponseResolve(json);
			}
		}
	}

	async downloadAlbums(options) {
		if (!app.browserManager.page) await app.browserManager.openBrowser();

		await app.browserManager.page.navigate("https://zvuk.com");

		await app.tools.delay(3000);

		await waitForSelector({
			page: app.browserManager.page,
			selector: "[class*=Header_buttons__]"
		});

		if (!await this.isLogined()) throw new Error("Not logined");

		for (const albumUrl of options.urls) {
			await app.browserManager.page.navigate(albumUrl);

			await app.tools.delay(3000);

			await waitForSelector({
				page: app.browserManager.page,
				selector: "[class*=HeaderTitlePage_]"
			});

			app.logsManager.log(`Start fetch album information ${albumUrl}`);

			const albumInfo = await this.getCurrentAlbumInfo();

			await this.downloadCover(albumInfo);
			// app.fs.writeFileSync(app.getUserDataPath("cover.jpg"), albumInfo.cover.buffer);

			const tracksAmount = await app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: () => Array.from(document.querySelectorAll("[class*=TrackList_wrapper__] [class*=ContentItem_wrapper__]")).length
			});

			app.logsManager.log(`Finish fetch album information ${albumUrl}`);

			for (let trackNumber = 0; trackNumber < tracksAmount; trackNumber++) {
				const trackInfo = await this.getTrackInfo(albumInfo, trackNumber);
				// app.fs.writeFileSync(app.getUserDataPath("track.mp3"), trackInfo.buffer);

				await this.downloadTrack(trackInfo);
				updateTagsInTrackInfoBuffer(trackInfo, albumInfo);

				albumInfo.trackInfos.push(trackInfo);
			}

			await app.uploadManager.uploadAlbum(albumInfo);
		}
	}

	async getCurrentAlbumInfo() {
		const { id, name, artist, year, coverUrlsString } = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: () => ({
				id: window.location.pathname.split("/").at(-1),
				name: document.querySelector("[class*=HeaderTitlePage_]").textContent.trim(),
				artist: document.querySelector("[class*=ArtistLink_text__]").textContent.trim(),
				year: Number(document.querySelector("[class*=InfoContainer_releaseDateType__]").textContent.trim().split(/\s/g).at(-1)),
				coverUrlsString: document.querySelector("[class*=ActiveCover_container__] [class*=Image_root__] img").getAttribute("srcset")
			})
		});

		const coverUrl = coverUrlsString
			.split(",")
			.map(line => {
				const parts = line.trim().split(" ");
				const url = parts[0];
				const size = parseFloat(parts[1]);

				return { url, size };
			})
			.filter(info => info.size >= CoverInfo.DEFAULT_COVER_SIZE)
			.at(0)
			.url;

		const albumInfo = new ZvukComAlbumInfo({
			id,
			coverUrl,
			artist,
			name,
			genre: "",
			year,
			isCompilation: false
		});

		return albumInfo;
	}

	async downloadUrlToBuffer(url) {
		const bufferInBase64 = await app.tools.retry(async () => {
			return app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: async url => {
					const DOWNLOAD_TIMEOUT_IN_MILLISECONDS = 15000;

					const response = await window.originalFunctions.fetch(url, {
						signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_IN_MILLISECONDS)
					});

					const arrayBuffer = await response.arrayBuffer();

					return window.arrayBufferToBase64String(arrayBuffer);
				},
				args: [url]
			});
		}, {
			maxRetries: 3,
			retryDelayInMilliseconds: 1000,
			checkError: err => err.name.toLowerCase().includes("timeout")
		});

		const buffer = Buffer.from(bufferInBase64, "base64");

		return buffer;
	}

	async downloadCover(albumInfo) {
		const coverInfo = albumInfo.cover;

		app.logsManager.log(`Start downloading cover ${getAlbumInfoText(coverInfo.entityInfo)}`);

		const responseBuffer = await (app.tools.mediaBufferCache.cachify(this.downloadUrlToBuffer.bind(this, coverInfo.url)))(getAlbumInfoText(albumInfo));

		const image = await JpegBufferImage.fromBuffer(responseBuffer);
		const imageBuffer = await image.resize(CoverInfo.DEFAULT_COVER_SIZE, CoverInfo.DEFAULT_COVER_SIZE).getJpegBuffer();

		coverInfo.buffer = imageBuffer;

		app.logsManager.log(`Finish downloading cover ${getAlbumInfoText(coverInfo.entityInfo)}, ${app.tools.formatSize(coverInfo.buffer.byteLength)}`);
	}

	async getTrackInfo(albumInfo, trackNumber) {
		const { id, name, artists } = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: trackNumber => {
				const elements = Array.from(document.querySelectorAll("[class*=TrackList_wrapper__] [class*=ContentItem_wrapper__]"));
				const element = elements[trackNumber];

				return {
					id: element.getAttribute("data-entity-id"),
					name: element.querySelector("[class*=Info_title__]").textContent.trim(),
					artists: Array.from(element.querySelectorAll("[class*=Info_descriptionContainer__] [class*=Text_text][class*=Info_description__]"))
						.map(element => element.textContent.trim())
				};
			},
			args: [trackNumber]
		});

		let processedArtists = artists.map(app.tools.nameCase);
		if (processedArtists.length === 0) throw new Error("Strange logic");

		const artist = albumInfo.artist;

		let processedName = name;

		if (processedArtists[0] === albumInfo.artist) processedArtists = processedArtists.slice(1);
		if (processedArtists.length > 0) processedName += ` (feat. ${processedArtists.join(", ")})`;

		const trackInfo = new ZvukComTrackInfo({
			albumInfo,
			id,
			artist,
			name: processedName,
			trackNumber: trackNumber + 1,
			url: null,
			extension: "mp3"
		});

		return trackInfo;
	}

	async getTrackDownloadUrl(trackInfo) {
		return app.tools.retry(async () => {
			const getStreamResponse = await this.getTrackStreamResponse(trackInfo);

			const downloadUrl = getStreamResponse.data.mediaContents[0].stream.high;
			if (!downloadUrl.includes(trackInfo.id)) throw new Error(`Bad download url ${getTrackInfoText(trackInfo)}`);

			return downloadUrl;
		}, {
			maxRetries: 3,
			retryDelayInMilliseconds: 1000
		});
	}

	async getTrackStreamResponse(trackInfo) {
		// app.logsManager.log(`Start fetching track stream ${getTrackInfoText(trackInfo)}`);

		app.logsManager.log(`Press play on track ${trackInfo.trackNumber} - ${getTrackInfoText(trackInfo)} ...`);

		const clear = () => {
			this.waitForGetStreamResponseResolve = null;
			this.waitForGetStreamResponseReject = null;
			this.waitForGetStreamResponseTimeout = clearTimeout(this.waitForGetStreamResponseTimeout);
		};

		clear();

		let streamResponse;

		try {
			streamResponse = await new Promise(async (resolve, reject) => {
				const FETCH_STREAM_TIMEOUT_IN_MILLISECONDS = 1000 * 60;

				this.waitForGetStreamResponseResolve = (...args) => {
					clear();

					return resolve(...args);
				};

				this.waitForGetStreamResponseReject = reason => {
					clear();

					return reject(reason);
				};

				this.waitForGetStreamResponseTimeout = setTimeout(() => {
					this.waitForGetStreamResponseReject(new Error(`Timeout waiting for getStream response ${getTrackInfoText(trackInfo)}`));
				}, FETCH_STREAM_TIMEOUT_IN_MILLISECONDS);

				// try {
				// 	await app.browserManager.page.evaluateInFrame({
				// 		frame: app.browserManager.page.mainFrame,
				// 		func: async trackName => {
				// 			const WAITING_SCROLLING_TIMEOUT_IN_MILLISECONDS = 1000;

				// 			const elements = Array.from(document.querySelectorAll("[class*=TrackList_wrapper__] [class*=ContentItem_wrapper__]"));
				// 			const element = elements.find(element => {
				// 				const name = element.querySelector("[class*=Info_title__]").textContent.trim();

				// 				return name.toLowerCase() === trackName.toLowerCase();
				// 			});

				// 			if (!element) throw new Error("No element");

				// 			const playButton = element.querySelector("[class*=Cover_cover__] button");

				// 			playButton.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });

				// 			await new Promise(resolve => setTimeout(resolve, WAITING_SCROLLING_TIMEOUT_IN_MILLISECONDS));

				// 			playButton.click();
				// 		},
				// 		args: [trackInfo.name]
				// 	});
				// } catch (err) {
				// 	this.waitForGetStreamResponseReject(err);
				// }
			});
		} catch (err) {
			app.logsManager.log(`Error fetching track stream ${getTrackInfoText(trackInfo)} ${err.message}`);

			throw err;
		} finally {
			clear();

			// app.logsManager.log(`Finish fetching track stream ${getTrackInfoText(trackInfo)}`);
		}

		return streamResponse;
	}

	async downloadTrack(trackInfo) {
		app.logsManager.log(`Start downloading track ${getTrackInfoText(trackInfo)}`);

		const responseBuffer = await (app.tools.mediaBufferCache.cachify(async () => {
			trackInfo.url = await this.getTrackDownloadUrl(trackInfo, trackInfo.trackNumber);

			return this.downloadUrlToBuffer(trackInfo.url);
		}))(getTrackInfoText(trackInfo));

		trackInfo.buffer = responseBuffer;

		app.logsManager.log(`Finish downloading track ${getTrackInfoText(trackInfo)}, ${app.tools.formatSize(trackInfo.buffer.byteLength)}`);
	}
};
