const sharp = require("sharp");

const { CoverInfo, TrackInfo, AlbumInfo, getTrackInfoText, getAlbumInfoText } = require("../entities/EntityInfos");
const { updateTagsInTrackInfo } = require("../../tools/tags");
const { hasSelector, waitForSelector } = require("../browser/pageUtils");
const formatSize = require("../../tools/formatSize");

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
		if (await hasSelector({ page: app.browserManager.page, selector: "[class*=Header_avatarText__]" })) return true;

		return false;
	}

	async handleBrowserManagerOnOpened() {
		function f() {
			window.originalFunctions = {
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
			if (postData.operationName === "getStream" &&
				this.waitForGetStreamResponseResolve) {
				const json = await app.browserManager.page.network.getResponseJson(params);

				this.waitForGetStreamResponseResolve(json);
			}
		}
	}

	async downloadAlbums(options) {
		if (!app.browserManager.page) await app.browserManager.openBrowser();

		await app.browserManager.page.navigate("https://zvuk.com");

		await app.tools.delay(3000);

		await waitForSelector({
			page: app.browserManager.page,
			selector: "[class*=Header_avatarText__]"
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

			await this.downloadCover(albumInfo.cover);
			// app.fs.writeFileSync(app.getUserDataPath("cover.jpg"), albumInfo.cover.buffer);

			const tracksAmount = await app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: () => Array.from(document.querySelectorAll("[class*=TrackList_wrapper__] [class*=ContentItem_wrapper__]")).length
			});

			app.logsManager.log(`Finish fetch album information ${albumUrl}`);

			for (let trackNumber = 0; trackNumber < tracksAmount; trackNumber++) {
				const trackInfo = await this.getTrackInfoAndDownloadTrack(albumInfo, trackNumber);
				updateTagsInTrackInfo(trackInfo, albumInfo);
				// app.fs.writeFileSync(app.getUserDataPath("track.mp3"), trackInfo.buffer);

				albumInfo.trackInfos.push(trackInfo);
			}

			await app.uploadManager.uploadAlbum(albumInfo);
		}
	}

	async getCurrentAlbumInfo() {
		const id = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: () => window.location.pathname.split("/").at(-1)
		});

		const name = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: () => document.querySelector("[class*=HeaderTitlePage_]").textContent.trim()
		});

		const artist = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: () => document.querySelector("[class*=ArtistLink_text__]").textContent.trim()
		});

		const year = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: () => Number(document.querySelector("[class*=InfoContainer_releaseDateType__]").textContent.trim().split(/\s/g).at(-1))
		});

		const coverUrlsString = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: () => document.querySelector("[class*=ActiveCover_container__] [class*=Image_root__] img").getAttribute("srcset")
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
		const bufferInBase64 = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: async url => {
				const response = await window.originalFunctions.fetch(url);

				const arrayBuffer = await response.arrayBuffer();

				return window.arrayBufferToBase64String(arrayBuffer);
			},
			args: [url]
		});

		const buffer = Buffer.from(bufferInBase64, "base64");

		return buffer;
	}

	async downloadCover(coverInfo) {
		app.logsManager.log(`Start downloading cover ${getAlbumInfoText(coverInfo.entityInfo)}`);

		const imageBuffer = await this.downloadUrlToBuffer(coverInfo.url);

		const imageProcessedBuffer = await sharp(imageBuffer)
			.resize(CoverInfo.DEFAULT_COVER_SIZE, CoverInfo.DEFAULT_COVER_SIZE)
			.jpeg({ quality: 100 })
			.toBuffer();

		// app.fs.writeFileSync(app.getUserDataPath("cover.jpg"), imageProcessedBuffer);
		// imageProcessedBuffer = app.fs.readFileSync(app.getUserDataPath("cover.jpg"));

		coverInfo.buffer = imageProcessedBuffer;

		app.logsManager.log(`Finish downloading cover ${getAlbumInfoText(coverInfo.entityInfo)}, ${formatSize(coverInfo.buffer.byteLength)}`);
	}

	async getTrackInfoAndDownloadTrack(albumInfo, trackNumber) {
		const { id, name } = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: trackNumber => {
				const elements = Array.from(document.querySelectorAll("[class*=TrackList_wrapper__] [class*=ContentItem_wrapper__]"));
				const element = elements[trackNumber];

				return {
					id: element.getAttribute("data-entity-id"),
					name: element.querySelector("[class*=Info_title__]").textContent.trim()
				};
			},
			args: [trackNumber]
		});

		const trackInfo = new ZvukComTrackInfo({
			albumInfo,
			id,
			artist: albumInfo.artist,
			name,
			trackNumber: trackNumber + 1,
			url: null,
			extension: "mp3"
		});

		app.logsManager.log(`Start downloading track ${getTrackInfoText(trackInfo)}`);

		const getStreamResponse = await new Promise(async (resolve, reject) => {
			this.waitForGetStreamResponseResolve = resolve;
			this.waitForGetStreamResponseReject = reject;

			await app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: trackNumber => {
					const playButtons = Array.from(document.querySelectorAll("[class*=TrackList_wrapper__] [class*=ContentItem_wrapper__] [class*=Cover_cover__] button"));
					playButtons[trackNumber].click();
				},
				args: [trackNumber]
			});
		});

		this.waitForGetStreamResponseResolve = null;
		this.waitForGetStreamResponseReject = null;

		trackInfo.url = getStreamResponse.data.mediaContents[0].stream.high;

		const buffer = await this.downloadUrlToBuffer(trackInfo.url);
		// app.fs.writeFileSync(app.getUserDataPath("track.mp3"), buffer);

		trackInfo.buffer = buffer;

		app.logsManager.log(`Finish downloading track ${getTrackInfoText(trackInfo)}, ${formatSize(trackInfo.buffer.byteLength)}`);

		return trackInfo;
	}
};
