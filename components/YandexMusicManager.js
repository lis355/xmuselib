const { spawn } = require("child_process");

const filenamifyLibrary = require("filenamify");
const sharp = require("sharp");
const NodeID3 = require("node-id3");

const COVER_SIZE = 500;
const DB = {};

function filenamify(path) {
	return filenamifyLibrary(path, { maxLength: 1024 });
}

module.exports = class YandexMusicManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		DB.albums = DB.albums || {};
		DB.tracks = DB.tracks || {};

		app.browserManager.events.on("response", this.processResponse.bind(this));
	}

	async run() {
		await super.run();

		await app.browserManager.page.navigate(app.path.join("https://music.yandex.ru/album", String(app.config.yandexAlbumId)));
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

			for (const albumInfo of json) {
				this.createAlbumInfo(albumInfo);
			}
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
			let trackInfo = DB.tracks[trackId];
			if (!trackInfo) {
				const responseResult = await app.browserManager.page.evaluateInFrame({
					frame: app.browserManager.page.mainFrame,
					func: trackId => fetch(`https://music.yandex.ru/handlers/track.jsx?track=${trackId}&lang=ru&external-domain=music.yandex.ru`).then(response => response.json()),
					args: [trackId]
				});

				trackInfo = responseResult.tracks ? app.libs._.first(responseResult.tracks) : responseResult.track;

				this.createTrackInfo(trackInfo);
			}

			if (!trackInfo) throw new Error("No trackInfo");

			if (!trackInfo.downloaded) {
				app.fs.outputFileSync(trackInfo.filePath, body);

				trackInfo.downloaded = true;

				this.logToConsoleAndToBrowserConsole(`[${this.getTrackInfoText(trackId)}] downloaded`);
			} else {
				this.logToConsoleAndToBrowserConsole(`[${this.getTrackInfoText(trackId)}] already downloaded`);
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
			const albumInfo = DB.albums[albumId];
			if (!albumInfo) throw new Error("No albumInfo");

			if (!albumInfo.cover.downloaded) {
				const body = await app.browserManager.page.network.getResponseBody(params.requestId);

				const pngImage = await sharp(body)
					.resize(COVER_SIZE, COVER_SIZE)
					.jpeg({ quality: 100 })
					.toBuffer();

				app.fs.outputFileSync(albumInfo.cover.filePath, pngImage);

				albumInfo.cover.downloaded = true;

				this.logToConsoleAndToBrowserConsole(`[${this.getCoverInfoText(albumId)}] downloaded`);
			} else {
				this.logToConsoleAndToBrowserConsole(`[${this.getCoverInfoText(albumId)}] already downloaded`);
			}

			setImmediate(async () => this.processAlbum(albumId));
		}
	}

	createAlbumInfo(albumInfo) {
		const albumId = albumInfo.id;
		if (!DB.albums[albumId]) {
			const artist = app.libs._.first(albumInfo.artists);

			DB.albums[albumId] = {
				createdAt: app.time.valueOf(),
				info: albumInfo,
				albumPath: app.getUserDataPath("music", filenamify(artist.name), filenamify(albumInfo.title)),
				cover: {
					filePath: app.getUserDataPath("temp", "covers", `${albumId}.jpg`),
					downloaded: false
				},
				processed: false
			};

			this.logToConsoleAndToBrowserConsole(`Album [${this.getAlbumInfoText(albumId)}] info created`);
		}
	}

	createTrackInfo(trackInfo) {
		const trackId = trackInfo.id;
		if (!DB.tracks[trackId]) {
			const filePath = app.getUserDataPath("temp", "tracks", `${trackId}.mp3`);

			DB.tracks[trackId] = {
				createdAt: app.time.valueOf(),
				info: trackInfo,
				filePath,
				downloaded: app.fs.existsSync(filePath)
			};
		}

		this.logToConsoleAndToBrowserConsole(`Track [${this.getTrackInfoText(trackId)}] info created`);
	}

	async processAlbum(albumId, options) {
		const albumInfo = DB.albums[albumId];
		if (!albumInfo) throw new Error("No albumInfo");

		if (albumInfo.processed && !app.libs._.get(options, "force", false)) return;

		const albumDownloadedTrackInfos = Object.values(DB.tracks)
			.filter(trackInfo => trackInfo.downloaded)
			.filter(trackInfo => trackInfo.info.albums.find(albumInfo => albumInfo.id === albumId));

		if (albumDownloadedTrackInfos.length !== albumInfo.info.trackCount) return;

		if (!albumInfo.cover.downloaded) return;

		for (const trackInfo of albumDownloadedTrackInfos) {
			await this.outputTrackWithTagsAndCover(albumInfo, trackInfo);
		}

		app.fs.copyFileSync(albumInfo.cover.filePath, app.path.join(albumInfo.albumPath, "cover.jpg"));

		albumInfo.processed = true;

		spawn("explorer.exe", [albumInfo.albumPath]);
	}

	async outputTrackWithTagsAndCover(albumInfo, trackInfo) {
		const artist = app.libs._.first(albumInfo.info.artists);
		const albumId = albumInfo.info.id;
		const trackAlbumInfo = trackInfo.info.albums.find(albumInfo => albumInfo.id === albumId);
		const trackPosition = trackAlbumInfo.trackPosition.index;

		const metadata = {
			artist: app.tools.nameCase(artist.name),
			album: app.tools.nameCase(albumInfo.info.title),
			trackNumber: app.libs._.padStart(String(trackPosition), 2, "0"),
			title: app.tools.nameCase(trackInfo.info.title),
			genre: app.tools.nameCase(albumInfo.info.genre),
			year: albumInfo.info.year
		};

		const fileName = filenamify(`${metadata.trackNumber}. ${metadata.artist} - ${metadata.album} (${metadata.year}) - ${metadata.title}.mp3`);
		const filePath = app.path.join(albumInfo.albumPath, fileName);

		app.fs.ensureDirSync(albumInfo.albumPath);
		app.fs.copyFileSync(trackInfo.filePath, filePath);

		NodeID3.write({
			...metadata,
			image: albumInfo.cover.filePath
		}, filePath);
	}

	getTrackInfoText(trackId) {
		const trackInfo = DB.tracks[trackId];
		const artist = app.libs._.first(trackInfo.info.artists);

		return `${artist.name} - ${trackInfo.info.title}`;
	}

	getAlbumInfoText(albumId) {
		const albumInfo = DB.albums[albumId];
		const artist = app.libs._.first(albumInfo.info.artists);

		return `${artist.name} - ${albumInfo.info.title} (${albumInfo.info.year})`;
	}

	getCoverInfoText(albumId) {
		const albumInfo = DB.albums[albumId];
		const artist = app.libs._.first(albumInfo.info.artists);

		return `${artist.name} - ${albumInfo.info.title} (${albumInfo.info.year})`;
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
