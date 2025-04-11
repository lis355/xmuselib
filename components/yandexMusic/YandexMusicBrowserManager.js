const EventEmitter = require("events");

const sharp = require("sharp");

const NodeID3 = require("../../libraries/node-id3");
const {
	click,
	hasSelector,
	waitForSelector
} = require("./pageUtils");

function formatSize(bytesAmount) {
	return (bytesAmount / 1024 ** 2).toFixed(2) + " Mb";
}

/* //////////////////// OldInterfaceBefore2025 //////////////////// */

// eslint-disable-next-line no-unused-vars
class YandexMusicBrowserOldManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.events = new EventEmitter();

		app.fs.removeSync(app.getUserDataPath("temp"));
		app.fs.removeSync(app.getUserDataPath("music"));

		this.albumInfos = {};
		this.trackInfos = {};

		app.browserManager.events.on("response", this.processResponse.bind(this));
	}

	async processResponse(params) {
		const requestUrl = new URL(params.request.url);
		const contentTypeHeader = params.responseHeaders.find(header => header.name.toLowerCase() === "content-type");

		if (requestUrl.origin.includes("music.yandex") &&
			requestUrl.pathname.endsWith("handlers/album.jsx") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await app.browserManager.page.network.getResponseJson(params);

			this.createAlbumInfo(json);
		} else if (requestUrl.origin.includes("music.yandex") &&
			requestUrl.pathname.endsWith("handlers/albums.jsx") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await app.browserManager.page.network.getResponseJson(params);

			for (const albumInfo of json) this.createAlbumInfo(albumInfo);
		} else if (requestUrl.origin.includes("music.yandex") &&
			requestUrl.pathname.endsWith("handlers/tracks") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await app.browserManager.page.network.getResponseJson(params);

			json.forEach(trackInfo => {
				this.createTrackInfo(trackInfo);
			});
		} else if (contentTypeHeader &&
			contentTypeHeader.value === "audio/mpeg") {
			// получение responseBody должно быть сразу первым обращением к CDP
			const body = await app.browserManager.page.network.getResponseBody(params.requestId);

			const trackId = requestUrl.searchParams.get("track-id");
			let trackInfo = this.trackInfos[trackId];
			if (!trackInfo) {
				const responseResult = await app.browserManager.page.evaluateInFrame({
					frame: app.browserManager.page.mainFrame,
					func: trackId => fetch(`https://music.yandex.ru/handlers/track.jsx?track=${trackId}&lang=ru&external-domain=music.yandex.ru`).then(response => response.json()),
					args: [trackId]
				});

				trackInfo = responseResult.tracks ? app.libs._.first(responseResult.tracks) : responseResult.track;

				trackInfo = this.createTrackInfo(trackInfo);
			}

			if (!trackInfo.downloaded) {
				app.fs.outputFileSync(trackInfo.filePath, body);

				trackInfo.downloaded = true;

				this.logToConsoleAndToBrowserConsole(`Трек [${this.getTrackInfoText(trackId)}] скачан`);

				this.events.emit("trackDowloaded", trackInfo);
			} else {
				this.logToConsoleAndToBrowserConsole(`Трек [${this.getTrackInfoText(trackId)}] уже скачан`);
			}

			const albumId = app.libs._.first(trackInfo.info.albums).id;
			setImmediate(async () => this.processAlbum(albumId));
		} else if (requestUrl.origin.includes("avatars.yandex.net") &&
			requestUrl.href.includes("1000x1000") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("image")) {
			const albumId = Number(requestUrl.href.split("/")[5].split(".")[2].split("-")[0]);
			const albumInfo = this.albumInfos[albumId];
			if (!albumInfo) throw new Error("No albumInfo");

			if (!albumInfo.cover.downloaded) {
				const body = await app.browserManager.page.network.getResponseBody(params.requestId);

				const COVER_SIZE = 500;

				const image = await sharp(body)
					.resize(COVER_SIZE, COVER_SIZE)
					.jpeg({ quality: 100 })
					.toBuffer();

				app.fs.outputFileSync(albumInfo.cover.filePath, image);

				albumInfo.cover.downloaded = true;

				this.logToConsoleAndToBrowserConsole(`Обложка альбома [${this.getCoverInfoText(albumId)}] скачана`);

				this.events.emit("albumCoverDowloaded", albumInfo);
			} else {
				this.logToConsoleAndToBrowserConsole(`Обложка альбома [${this.getCoverInfoText(albumId)}] уже скачана`);
			}

			setImmediate(async () => this.processAlbum(albumId));
		}
	}

	createAlbumInfo(albumInfo) {
		const albumId = albumInfo.id;
		if (!this.albumInfos[albumId]) {
			albumInfo.artist = app.tools.nameCase(albumInfo.artists.map(artist => artist.name).join(", "));
			albumInfo.name = app.tools.nameCase(albumInfo.title);
			albumInfo.genre = app.tools.nameCase(albumInfo.genre);

			this.albumInfos[albumId] = {
				info: albumInfo,
				albumPath: app.getUserDataPath("music", [app.tools.filenamify(albumInfo.artist), app.tools.filenamify(albumInfo.name)].join(" - ")),
				cover: {
					filePath: app.getUserDataPath("temp", "covers", `${albumId}.jpg`),
					downloaded: false
				},
				compilation: albumInfo.type === "compilation",
				processed: false
			};

			this.logToConsoleAndToBrowserConsole(`Информация для альбома [${this.getAlbumInfoText(albumId)}] создана`);

			this.events.emit("albumInfoCreated", this.albumInfos[albumId]);
		}

		return this.albumInfos[albumId];
	}

	createTrackInfo(trackInfo) {
		const trackId = trackInfo.id;
		if (!this.trackInfos[trackId]) {
			trackInfo.artist = app.tools.nameCase(app.libs._.first(trackInfo.artists).name);
			trackInfo.name = app.tools.nameCase(trackInfo.title);

			if (trackInfo.artists.length > 1) trackInfo.name += ` (feat. ${trackInfo.artists.slice(1).map(artistInfo => app.tools.nameCase(artistInfo.name))})`;

			if (trackInfo.version) trackInfo.name += ` (${app.tools.nameCase(trackInfo.version)})`;

			const filePath = app.getUserDataPath("temp", "tracks", `${trackId}.mp3`);

			this.trackInfos[trackId] = {
				info: trackInfo,
				filePath,
				downloaded: app.fs.existsSync(filePath),
				processed: false
			};

			this.logToConsoleAndToBrowserConsole(`Информация для трека [${this.getTrackInfoText(trackId)}] создана`);

			this.events.emit("trackInfoCreated", this.trackInfos[trackId]);
		}

		return this.trackInfos[trackId];
	}

	async processAlbum(albumId, options) {
		const albumInfo = this.albumInfos[albumId];
		if (!albumInfo) throw new Error("No albumInfo");

		if (albumInfo.processed &&
			!app.libs._.get(options, "force", false)) return;

		const albumDownloadedTrackInfos = Object.values(this.trackInfos)
			.filter(trackInfo => trackInfo.downloaded)
			.filter(trackInfo => trackInfo.info.albums.find(albumInfo => albumInfo.id === albumId));

		if (albumDownloadedTrackInfos.length !== albumInfo.info.trackCount) return;

		if (!albumInfo.cover.downloaded) {
			this.logToConsoleAndToBrowserConsole(`Не скачана обложка для альбома [${this.getAlbumInfoText(albumId)}]`);

			return;
		}

		this.events.emit("albumUploadingStarted", albumInfo);

		app.fs.ensureDirSync(albumInfo.albumPath);

		albumInfo.cover.outFilePath = app.path.posix.join(albumInfo.albumPath, "cover.jpg");
		app.fs.copyFileSync(albumInfo.cover.filePath, albumInfo.cover.outFilePath);
		app.fs.removeSync(albumInfo.cover.filePath);

		for (const trackInfo of albumDownloadedTrackInfos) await this.outputTrackWithTagsAndCover(albumInfo, trackInfo);

		albumInfo.processed = true;

		await app.uploadManager.uploadAlbum(albumInfo, albumDownloadedTrackInfos);

		app.fs.removeSync(albumInfo.albumPath);

		this.events.emit("albumUploadingFinished", albumInfo);
	}

	async outputTrackWithTagsAndCover(albumInfo, trackInfo) {
		const trackAlbumInfo = trackInfo.info.albums.find(info => info.id === albumInfo.info.id);

		const tags = {
			artist: trackInfo.info.artist,
			album: albumInfo.info.name,
			trackNumber: app.tools.formatTrackNumber(trackAlbumInfo.trackPosition.index),
			title: trackInfo.info.name,
			genre: albumInfo.info.genre,
			year: albumInfo.info.year,
			image: albumInfo.cover.filePath
		};

		if (albumInfo.compilation) tags.compilation = "1";

		trackInfo.outFileName = app.tools.filenamify(`${tags.trackNumber}. ${tags.artist} - ${tags.album} (${tags.year}) - ${tags.title}.mp3`);
		trackInfo.outFilePath = app.path.posix.join(albumInfo.albumPath, trackInfo.outFileName);

		app.fs.copyFileSync(trackInfo.filePath, trackInfo.outFilePath);
		app.fs.removeSync(trackInfo.filePath);

		NodeID3.write(tags, trackInfo.outFilePath);

		trackInfo.processed = true;
	}

	getTrackInfoText(trackId) {
		const trackInfo = this.trackInfos[trackId];

		return `${trackInfo.info.artist} - ${trackInfo.info.name}`;
	}

	getAlbumInfoText(albumId) {
		const albumInfo = this.albumInfos[albumId];

		return `${albumInfo.info.artist} - ${albumInfo.info.name} (${albumInfo.info.year})`;
	}

	getCoverInfoText(albumId) {
		const albumInfo = this.albumInfos[albumId];

		return `${albumInfo.info.artist} - ${albumInfo.info.name} (${albumInfo.info.year})`;
	}

	logToConsoleAndToBrowserConsole(log) {
		app.log.info(log);

		app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: log => console.log(log),
			args: [log]
		});
	}

	async runAutomationDownloadAlbums() {
		let albumInfo;
		let albumCoverDowloadedPromiseResolve;
		let trackDowloadedPromiseResolve;
		let albumUploadingFinishedPromiseResolve;

		this.events
			.on("albumInfoCreated", info => {
				if (this.albumUrl.includes(info.info.id.toString())) {
					albumInfo = info;
				}
			})
			.on("trackInfoCreated", trackInfo => {
			})
			.on("albumCoverDowloaded", albumInfo => {
				albumCoverDowloadedPromiseResolve();
				albumCoverDowloadedPromiseResolve = null;
			})
			.on("trackDowloaded", trackInfo => {
				trackDowloadedPromiseResolve();
				trackDowloadedPromiseResolve = null;
			})
			.on("albumUploadingStarted", albumInfo => {
			})
			.on("albumUploadingFinished", trackInfo => {
				albumUploadingFinishedPromiseResolve();
				albumUploadingFinishedPromiseResolve = null;
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

			for (let i = 0; i < albumInfo.info.trackCount; i++) {
				await Promise.all([
					click({
						page: app.browserManager.page,
						selector: `.d-track[data-item-id='${albumInfo.info.trackIds[i]}'] button.button-play`
					}),
					new Promise(resolve => {
						trackDowloadedPromiseResolve = resolve;
					})
				]);
			}

			await Promise.all([
				click({
					page: app.browserManager.page,
					selector: "img.entity-cover__image"
				}),
				new Promise(resolve => {
					albumCoverDowloadedPromiseResolve = resolve;
				})
			]);

			await new Promise(resolve => {
				albumUploadingFinishedPromiseResolve = resolve;
			});
		}
	}
};

/* //////////////////// InterfaceSpring2025 //////////////////// */

// для service worker
// window.addEventListener("message", e => {
// 	if (e &&
// 		e.data &&
// 		e.data.method === "configureSource" &&
// 		e.data.params &&
// 		e.data.params.config &&
// 		e.data.params.config.audioDecodingKey) {
// 		window.audioDecodingKeys = window.audioDecodingKeys || {};
// 		window.audioDecodingKeys[e.data.params.source] = e.data.params.config.audioDecodingKey;
// 		console.log(e.data.params.source, e.data.params.config.audioDecodingKey);
// 	}
// });

// audioDecodingKey = window.audioDecodingKeys[source];

// function downloadArray(data) {
// 	const link = document.createElement("a");
// 	link.style.display = "none";
// 	document.body.appendChild(link);

// 	const blob = new Blob([data], { type: "application/octet-binary" });
// 	const objectURL = URL.createObjectURL(blob);

// 	link.href = objectURL;
// 	link.href = URL.createObjectURL(blob);
// 	link.download = `${params.trackId}-${params.quality}.${downloadInfo.codec}`;
// 	link.click();
// }

class CoverInfo {
	constructor(raw, entityInfo) {
		this.raw = raw;
		this.entityInfo = entityInfo;

		this.uri = "https://" + this.raw.coverUri.replace("%%", "m400x400");

		this.buffer = null;
	}
}

class TrackInfo {
	constructor(raw, albumInfo, trackNumber) {
		this.raw = raw;

		this.albumInfo = albumInfo;
		this.trackNumber = trackNumber;

		this.id = this.raw.id;

		this.artist = app.tools.nameCase(app.libs._.first(this.raw.artists).name);

		this.name = app.tools.nameCase(this.raw.title);
		if (this.raw.artists.length > 1) this.name += ` (feat. ${this.raw.artists.slice(1).map(artistInfo => app.tools.nameCase(artistInfo.name)).join(", ")})`;
		if (this.raw.version) this.name += ` (${app.tools.nameCase(this.raw.version)})`;

		this.buffer = null;
		this.extension = null;
	}
}

class AlbumInfo {
	constructor(raw) {
		this.raw = raw;

		this.id = this.raw.id;

		this.cover = new CoverInfo(raw, this);

		this.artist = this.raw.artists.map(artist => app.tools.nameCase(artist.name)).join(", ");
		this.name = app.tools.nameCase(this.raw.title);
		this.genre = app.tools.nameCase(this.raw.genre);
		this.year = this.raw.year;
		this.isCompilation = this.raw.type === "compilation";

		// TODO
		const volume = app.libs._.first(this.raw.volumes);

		this.trackInfos = volume.map((trackRawData, index) => new TrackInfo(trackRawData, this, index + 1));
	}
}

const DEBUG_FILE_CACHE_ENABLED = process.env.DEBUG_FILE_CACHE_ENABLED === "true";

class YandexMusicBrowserInterfaceSpring2025Manager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.events = new EventEmitter();
	}

	getTrackInfoText(trackInfo) {
		return `${trackInfo.artist} - ${trackInfo.name}`;
	}

	getAlbumInfoText(albumInfo) {
		return `${albumInfo.artist} - ${albumInfo.name} (${albumInfo.year})`;
	}

	logToConsoleAndToBrowserConsole(log) {
		app.log.info(log);

		app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: log => console.log(log),
			args: [log]
		});
	}

	async isLogined() {
		return hasSelector({
			page: app.browserManager.page,
			selector: "button.UserID-Account"
		});
	}

	async getAlbumInfoWithTrackInfos(albumId) {
		const rawAlbumData = await app.browserManager.page.evaluateInFrame({
			frame: app.browserManager.page.mainFrame,
			func: async albumId => {
				const response = await fetch(`https://api.music.yandex.ru/albums/${albumId}/with-tracks`, {
					"headers": {
						"x-yandex-music-client": "YandexMusicWebNext/1.0.0"
					},
					"method": "GET",
					"credentials": "include"
				});

				const data = await response.json();

				return data.result;
			},
			args: [albumId]
		});

		return new AlbumInfo(rawAlbumData);
	}

	async downloadTrack(trackInfo) {
		this.logToConsoleAndToBrowserConsole(`Start downloading track ${this.getTrackInfoText(trackInfo)}`);

		let buffer;
		let extension;

		const cacheFilePath = app.getUserDataPath(`${trackInfo.id}.track.mp3`);
		if (DEBUG_FILE_CACHE_ENABLED &&
			app.fs.existsSync(cacheFilePath)) {
			buffer = app.fs.readFileSync(cacheFilePath);
			extension = "mp3";
		} else {
			const evaluateResult = await app.browserManager.page.evaluateInFrame({
				frame: app.browserManager.page.mainFrame,
				func: async trackId => {
					async function downloadTrack(trackId) {
						// NOTE нашел в исходниках yasp (yandex music player frontend web)
						// был просто захардкожен, но может меняться со временем - не известно
						// file:s3/music-frontend-static/music/v4.749.2/_next/static/2958-3f1cc5e70e934ab7.js
						const secretKey = "7tvSmFbyf5hJnIHhCimDDD";

						const quality = "nq"; // lq nq lossless

						const params = {
							trackId,
							quality,
							codecs:
								[
									// "flac",
									// "aac",
									// "he-aac",
									"mp3"
									// "flac-mp4",
									// "aac-mp4",
									// "he-aac-mp4"
								],
							transports:
								[
									"encraw"
								]
						};

						const tsInSeconds = Math.floor(Date.now() / 1e3);

						let sign = "".concat(tsInSeconds).concat(params.trackId).concat(params.quality).concat(params.codecs.join("")).concat(params.transports.join(""));
						let cryptoKey = await crypto.subtle.importKey(
							"raw",
							new TextEncoder().encode(secretKey),
							{
								name: "HMAC",
								hash: {
									name: "SHA-256"
								}
							},
							true,
							["sign", "verify"]
						);

						sign = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(sign));
						sign = btoa(String.fromCharCode(...new Uint8Array(sign))).slice(0, -1);

						let response = await fetch("https://api.music.yandex.ru/get-file-info?" + new URLSearchParams({
							ts: tsInSeconds,
							trackId: params.trackId,
							quality: params.quality,
							codecs: params.codecs,
							transports: params.transports,
							sign: sign
						}), {
							"headers": {
								"x-yandex-music-client": "YandexMusicWebNext/1.0.0"
							},
							"method": "GET",
							"credentials": "include"
						});

						const data = await response.json();

						const downloadInfo = data.result.downloadInfo;

						const source = downloadInfo.url;

						// чтобы узнать bytesTotal можно отправить запрос "range": `bytes=0-0`
						response = await fetch(source, {
							"headers": {
								"range": "bytes=0-0"
							}
						});

						const bytesTotal = parseInt(response.headers.get("content-range").split("/")[1]);

						let audioDecodingKey = downloadInfo.key;

						response = await fetch(source, {
							"headers": {
								"range": `bytes=0-${bytesTotal - 1}`
							}
						});

						const buffer = await response.arrayBuffer();

						function createCounter(e) {
							const r = new Uint8Array(16);
							for (let t = e, n = 0; n < 16; ++n) {
								r[r.length - 1 - n] = 255 & t;
								t >>= 8;
							}

							return r;
						}

						function parseHexString(e) {
							return new Uint8Array(e.match(/.{1,2}/g).map(x => parseInt(x, 16)));
						}

						audioDecodingKey = parseHexString(audioDecodingKey);

						cryptoKey = await window.crypto.subtle.importKey(
							"raw",
							audioDecodingKey,
							{
								name: "AES-CTR"
							},
							false,
							["decrypt"]
						);

						const counter = createCounter(0); // начинаем с начала массива

						const decodedBuffer = await window.crypto.subtle.decrypt({
							name: "AES-CTR",
							counter,
							length: 128
						}, cryptoKey, buffer);

						function arrayBufferToBase64String(arrayBuffer) {
							const uint8arr = new Uint8Array(arrayBuffer);
							const arr = new Array(uint8arr.length);
							for (let i = 0; i < uint8arr.length; i++) arr[i] = String.fromCharCode(uint8arr[i]);

							const str = arr.join("");
							const base64Str = btoa(str);

							return base64Str;
						}

						const trackBase64String = arrayBufferToBase64String(decodedBuffer);

						return {
							trackBase64String,
							extension: "mp3"
						};
					}

					return downloadTrack(trackId);
				},
				args: [trackInfo.id]
			});

			buffer = Buffer.from(evaluateResult.trackBase64String, "base64");
			extension = evaluateResult.extension;

			if (DEBUG_FILE_CACHE_ENABLED) app.fs.writeFileSync(cacheFilePath, buffer);
		}

		trackInfo.buffer = buffer;
		trackInfo.extension = extension;

		this.logToConsoleAndToBrowserConsole(`Finish downloading track ${this.getTrackInfoText(trackInfo)}, ${formatSize(buffer.byteLength)}`);
	}

	async downloadCover(coverInfo) {
		this.logToConsoleAndToBrowserConsole(`Start downloading cover ${this.getAlbumInfoText(coverInfo.entityInfo)}`);

		let buffer;

		const cacheFilePath = app.getUserDataPath(`${coverInfo.entityInfo.id}.cover.jpg`);
		if (DEBUG_FILE_CACHE_ENABLED &&
			app.fs.existsSync(cacheFilePath)) {
			buffer = app.fs.readFileSync(cacheFilePath);
		} else {
			const response = await fetch(coverInfo.uri, {
				"method": "GET"
			});

			buffer = Buffer.from(await response.arrayBuffer());

			if (DEBUG_FILE_CACHE_ENABLED) app.fs.writeFileSync(cacheFilePath, buffer);
		}

		coverInfo.buffer = buffer;

		this.logToConsoleAndToBrowserConsole(`Finish downloading cover ${this.getAlbumInfoText(coverInfo.entityInfo)}, ${formatSize(buffer.byteLength)}`);
	}

	updateTagsInTrackInfo(trackInfo, albumInfo) {
		const tags = {
			artist: trackInfo.artist,
			album: albumInfo.name,
			trackNumber: app.tools.formatTrackNumber(trackInfo.trackNumber),
			title: trackInfo.name,
			genre: albumInfo.genre,
			year: albumInfo.year,
			image: albumInfo.cover.buffer
		};

		if (albumInfo.isCompilation) tags.compilation = "1";

		trackInfo.buffer = NodeID3.write(tags, trackInfo.buffer);
	}

	async runAutomationDownloadAlbums(albumUrls) {
		await app.browserManager.page.navigate("https://music.yandex.ru/");

		await app.tools.delay(3000);

		await waitForSelector({
			page: app.browserManager.page,
			selector: "[class*=NavbarDesktop_logoWrapper]"
		});

		if (!await this.isLogined()) throw new Error("Not logined");

		for (const albumUrl of albumUrls) {
			const albumId = new URL(albumUrl).pathname.split("/").filter(Boolean).at(-1);

			const albumInfo = await this.getAlbumInfoWithTrackInfos(albumId);
			// app.tools.json.save(app.getUserDataPath("albumInfo.json"), albumInfo);

			for (const trackInfo of albumInfo.trackInfos) {
				await this.downloadTrack(trackInfo);
				this.updateTagsInTrackInfo(trackInfo, albumInfo);
				// app.fs.writeFileSync(app.getUserDataPath("track.mp3"), trackInfo.buffer);
			}

			await this.downloadCover(albumInfo.cover);
			// app.fs.writeFileSync(app.getUserDataPath("cover.jpg"), albumInfo.cover.buffer);

			await app.uploadManager.uploadAlbum(albumInfo);
		}
	}
};

class YandexMusicBrowserManager extends YandexMusicBrowserInterfaceSpring2025Manager { }

module.exports = YandexMusicBrowserManager;
