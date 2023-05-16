/* eslint-disable no-debugger */

const sharp = require("sharp");
const NodeID3 = require("node-id3");

const COVER_SIZE = 500;

module.exports = class YandexMusicManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		app.fs.removeSync(app.getUserDataPath("temp"));
		app.fs.removeSync(app.getUserDataPath("music"));

		this.albumInfos = {};
		this.trackInfos = {};

		app.browserManager.events.on("response", this.processResponse.bind(this));
	}

	async run() {
		await super.run();

		await app.browserManager.page.navigate(app.tools.urljoin("https://music.yandex.ru/album", String(app.config.yandexAlbumId)));
	}

	async processResponse(params) {
		const requestUrl = new URL(params.request.url);
		const contentTypeHeader = params.responseHeaders.find(header => header.name.toLowerCase() === "content-type");

		if (requestUrl.origin.includes("music.yandex.ru") &&
			requestUrl.pathname.endsWith("handlers/album.jsx") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await app.browserManager.page.network.getResponseJson(params);

			this.createAlbumInfo(json);
		} else if (requestUrl.origin.includes("music.yandex.ru") &&
			requestUrl.pathname.endsWith("handlers/albums.jsx") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await app.browserManager.page.network.getResponseJson(params);

			for (const albumInfo of json) this.createAlbumInfo(albumInfo);
		} else if (requestUrl.origin.includes("music.yandex.ru") &&
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
			} else {
				this.logToConsoleAndToBrowserConsole(`Трек [${this.getTrackInfoText(trackId)}] уже скачан`);
			}

			// https://music.yandex.ru/handlers/track.jsx?track=108091000&lang=ru&external-domain=music.yandex.ru
			// https://music.yandex.ru/handlers/album.jsx?album=20063773&lang=ru&external-domain=music.yandex.ru
			// await fetch("https://music.yandex.ru/handlers/track.jsx?track=108091000&lang=ru&external-domain=music.yandex.ru").then(r => r.json())

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

				const pngImage = await sharp(body)
					.resize(COVER_SIZE, COVER_SIZE)
					.jpeg({ quality: 100 })
					.toBuffer();

				app.fs.outputFileSync(albumInfo.cover.filePath, pngImage);

				albumInfo.cover.downloaded = true;

				this.logToConsoleAndToBrowserConsole(`Обложка альбома [${this.getCoverInfoText(albumId)}] скачана`);
			} else {
				this.logToConsoleAndToBrowserConsole(`Обложка альбома [${this.getCoverInfoText(albumId)}] уже скачана`);
			}

			setImmediate(async () => this.processAlbum(albumId));
		}
	}

	createAlbumInfo(albumInfo) {
		const albumId = albumInfo.id;
		if (!this.albumInfos[albumId]) {
			// TODO correct artist
			if (albumInfo.artists.length > 1) debugger;

			albumInfo.artist = app.tools.nameCase(app.libs._.first(albumInfo.artists).name);
			albumInfo.name = app.tools.nameCase(albumInfo.title);
			albumInfo.genre = app.tools.nameCase(albumInfo.genre);

			this.albumInfos[albumId] = {
				info: albumInfo,
				albumPath: app.getUserDataPath("music", app.tools.filenamify(albumInfo.artist), app.tools.filenamify(albumInfo.name)),
				cover: {
					filePath: app.getUserDataPath("temp", "covers", `${albumId}.jpg`),
					downloaded: false
				},
				processed: false
			};

			this.logToConsoleAndToBrowserConsole(`Информация для альбома [${this.getAlbumInfoText(albumId)}] создана`);
		}

		return this.albumInfos[albumId];
	}

	createTrackInfo(trackInfo) {
		const trackId = trackInfo.id;
		if (!this.trackInfos[trackId]) {
			// TODO correct artist
			if (trackInfo.artists.length > 1) debugger;

			trackInfo.name = app.tools.nameCase(trackInfo.title);

			const filePath = app.getUserDataPath("temp", "tracks", `${trackId}.mp3`);

			this.trackInfos[trackId] = {
				info: trackInfo,
				filePath,
				downloaded: app.fs.existsSync(filePath),
				processed: false
			};

			this.logToConsoleAndToBrowserConsole(`Информация для трека [${this.getTrackInfoText(trackId)}] создана`);
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

		app.fs.ensureDirSync(albumInfo.albumPath);

		albumInfo.cover.outFilePath = app.path.posix.join(albumInfo.albumPath, "cover.jpg");
		app.fs.copyFileSync(albumInfo.cover.filePath, albumInfo.cover.outFilePath);

		for (const trackInfo of albumDownloadedTrackInfos) await this.outputTrackWithTagsAndCover(albumInfo, trackInfo);

		albumInfo.processed = true;

		app.uploadManager.uploadAlbum(albumInfo, albumDownloadedTrackInfos);
	}

	async outputTrackWithTagsAndCover(albumInfo, trackInfo) {
		const trackAlbumInfo = trackInfo.info.albums.find(info => info.id === albumInfo.info.id);

		const metadata = {
			artist: albumInfo.info.artist,
			album: albumInfo.info.name,
			trackNumber: app.libs._.padStart(String(trackAlbumInfo.trackPosition.index), 2, "0"),
			title: trackInfo.info.name,
			genre: albumInfo.info.genre,
			year: albumInfo.info.year,
			image: albumInfo.cover.filePath
		};

		trackInfo.outFileName = app.tools.filenamify(`${metadata.trackNumber}. ${metadata.artist} - ${metadata.album} (${metadata.year}) - ${metadata.title}.mp3`);
		trackInfo.outFilePath = app.path.posix.join(albumInfo.albumPath, trackInfo.outFileName);

		app.fs.copyFileSync(trackInfo.filePath, trackInfo.outFilePath);

		NodeID3.write(metadata, trackInfo.outFilePath);

		trackInfo.processed = true;
	}

	getTrackInfoText(trackId) {
		const trackInfo = this.trackInfos[trackId];

		// TODO correct albums
		if (trackInfo.info.albums > 1) debugger;
		const albumInfo = this.albumInfos[app.libs._.first(trackInfo.info.albums).id];

		return `${albumInfo.info.artist} - ${trackInfo.info.title}`;
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
};
