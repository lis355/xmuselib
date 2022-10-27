const { spawn } = require("child_process");

const filenamify = require("filenamify");
const sharp = require("sharp");

async function executeShellCommand({ cmd, cwd, env = {}, onStdOutData, onStdErrData, onClose }) {
	return new Promise(resolve => {
		const options = {
			shell: true
		};

		options.env = app.libs._.assign({}, env);

		if (cwd) options.cwd = cwd;

		// const child = spawn(programm, args, options);
		const child = spawn(cmd, options);

		child.stdout.on("data", data => onStdOutData && onStdOutData(data));
		child.stderr.on("data", data => onStdErrData && onStdErrData(data));

		child.on("close", code => {
			onClose && onClose();

			return resolve(code);
		});
	});
};

const COVER_SIZE = 500;

// https://github.com/lis355/tracktags

const METADATA_HEADER = ";FFMETADATA1";
const NEW_LINE = "\n";

function formatMetadata(metadata) {
	return [METADATA_HEADER, ...metadata.mapToArray((key, value) => `${key}=${value}`)].join(NEW_LINE) + NEW_LINE;
}

function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = class YandexMusicManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		app.db.albums = app.db.albums || {};
		app.db.tracks = app.db.tracks || {};

		this.page = await new Promise(resolve => {
			app.browser.once("pageAdded", page => {
				page.network.responseHandler = async params => {
					try {
						if (params.responseErrorReason) {
							await this.processResponseFailed(params);
						} else {
							await this.processResponse(params);
						}
					} catch (error) {
						app.log.error(error.stack);
					}
				};

				return resolve(page);
			});
		});
	}

	async run() {
		await super.run();

		await this.page.navigate("https://music.yandex.ru/");
	}

	async processResponseFailed(params) {
	}

	async processResponse(params) {
		const requestUrl = new URL(params.request.url);
		const contentTypeHeader = params.responseHeaders.find(header => header.name.toLowerCase() === "content-type");

		// if (requestUrl.origin.includes("avatars.yandex.net")) {
		// 	app.log.info(requestUrl.href);
		// }

		if (requestUrl.origin.includes("music.yandex.ru") &&
			requestUrl.pathname.endsWith("handlers/album.jsx") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await this.page.network.getResponseJson(params);

			this.createAlbumInfo(json);
		} else if (requestUrl.origin.includes("music.yandex.ru") &&
			requestUrl.pathname.endsWith("handlers/albums.jsx") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await this.page.network.getResponseJson(params);

			for (const albumInfo of json) {
				this.createAlbumInfo(albumInfo);
			}
		} else if (requestUrl.origin.includes("music.yandex.ru") &&
			requestUrl.pathname.endsWith("handlers/tracks") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("json")) {
			const json = await this.page.network.getResponseJson(params);

			json.forEach(trackInfo => {
				const trackId = trackInfo.id;
				const filePath = app.getUserDataPath("temp", "tracks", `${trackId}.mp3`);

				if (!app.db.tracks[trackId]) {
					app.db.tracks[trackId] = {
						createdAt: app.time.valueOf(),
						info: trackInfo,
						filePath,
						downloaded: app.fs.existsSync(filePath)
					};

					app.localDbManager.save();
				}
			});
		} else if (contentTypeHeader &&
			contentTypeHeader.value === "audio/mpeg") {
			const trackId = requestUrl.searchParams.get("track-id");
			const trackInfo = app.db.tracks[trackId];
			if (!trackInfo) throw new Error("No trackInfo");

			// const album = app.libs._.first(trackInfo.albums);
			// const albumInfo = this.albumInfos[album.id];
			// if (!albumInfo) throw new Error("No albumInfo");

			if (!trackInfo.downloaded) {
				// const artist = app.libs._.first(albumInfo.artists);
				// const fileName = `${trackId}.mp3`;
				// const filePath = app.path.join(albumInfo.downloadInfo.tempDirectory, fileName);

				const body = await this.page.network.getResponseBody(params.requestId);

				app.fs.outputFileSync(trackInfo.filePath, body);

				trackInfo.downloaded = true;

				app.localDbManager.save();

				await this.logToConsoleAndToBrowserConsole(`[${trackId}] downloaded`);

				// await this.logToConsoleAndToBrowserConsole(`[${artist.name} - ${album.title} (${album.year}) - ${trackInfo.title}] downloaded`);

				// albumInfo.downloadInfo.tracks[trackId] = filePath;
			} else {
				// await this.logToConsoleAndToBrowserConsole(`[${artist.name} - ${album.title} (${album.year}) - ${trackInfo.title}] already downloaded`);
			}

			const albumId = app.libs._.first(trackInfo.info.albums).id;
			setImmediate(async () => this.processAlbum(albumId));
		} else if (requestUrl.origin.includes("avatars.yandex.net") &&
			requestUrl.href.includes("1000x1000") &&
			contentTypeHeader &&
			contentTypeHeader.value.includes("image")) {
			const albumId = Number(requestUrl.href.split("/")[5].split(".")[2].split("-")[0]);
			const albumInfo = app.db.albums[albumId];
			if (!albumInfo) throw new Error("No albumInfo");

			if (!albumInfo.cover.downloaded) {
				const body = await this.page.network.getResponseBody(params.requestId);

				const pngImage = await sharp(body)
					.resize(COVER_SIZE, COVER_SIZE)
					.png()
					.toBuffer();

				app.fs.outputFileSync(albumInfo.cover.filePath, pngImage);

				albumInfo.cover.downloaded = true;

				app.localDbManager.save();

				// const coverPath = app.path.join(albumInfo.downloadInfo.albumPath, "cover.png");
				// albumInfo.downloadInfo.coverPath = coverPath;

				// const artist = app.libs._.first(albumInfo.artists);
				// await this.logToConsoleAndToBrowserConsole(`Cover for [${artist.name} - ${albumInfo.title} (${albumInfo.year})] downloaded`);

				// setImmediate(async () => this.processAlbumItemDownloaded(albumInfo));
			}

			setImmediate(async () => this.processAlbum(albumId));
		}
	}

	createAlbumInfo(albumInfo) {
		const albumId = albumInfo.id;

		const artist = app.libs._.first(albumInfo.artists);

		app.db.albums[albumId] = {
			createdAt: app.time.valueOf(),
			info: albumInfo,
			albumPath: app.getUserDataPath("music", filenamify(artist.name), filenamify(albumInfo.title)),
			cover: {
				filePath: app.getUserDataPath("temp", "covers", `${albumId}.png`),
				downloaded: false
			},
			processed: false
		};

		app.localDbManager.save();

		// this.albumInfos[albumInfo.id] = albumInfo;
		// const artist = app.libs._.first(albumInfo.artists);
		// albumInfo.downloadInfo = {
		// 	albumPath: app.getUserDataPath("music", filenamify(artist.name), filenamify(albumInfo.title)),
		// 	tempDirectory: app.getUserDataPath("temp", String(albumInfo.id)),
		// 	tracks: {},
		// 	coverPath: null
		// };

		// if (app.fs.existsSync(albumInfo.downloadInfo.tempDirectory)) {
		// 	app.fs.readdirSync(albumInfo.downloadInfo.tempDirectory)
		// 		.filter(directory => directory.includes(".mp3"))
		// 		.forEach(directory => {
		// 			const trackId = Number(directory.replace(".mp3", ""));
		// 			albumInfo.downloadInfo.tracks[trackId] = app.path.join(albumInfo.downloadInfo.tempDirectory, directory);
		// 		});
		// }
	}

	async processAlbum(albumId) {
		const albumInfo = app.db.albums[albumId];
		if (!albumInfo) throw new Error("No albumInfo");

		if (albumInfo.processed) return;

		const albumDownloadedTrackInfos = Object.values(app.db.tracks)
			.filter(trackInfo => trackInfo.downloaded)
			.filter(trackInfo => trackInfo.info.albums.find(albumInfo => albumInfo.id === albumId));

		if (albumDownloadedTrackInfos.length !== albumInfo.info.trackCount) return;

		if (!albumInfo.cover.downloaded) return;

		for (const trackInfo of albumDownloadedTrackInfos) {
			await this.outputTrackWithTagsAndCover(albumInfo, trackInfo);
		}

		app.fs.copyFileSync(albumInfo.cover.filePath, app.path.join(albumInfo.albumPath, "cover.png"));

		albumInfo.processed = true;

		app.localDbManager.save();

		// const artist = app.libs._.first(albumInfo.info.artists);
		// await this.logToConsoleAndToBrowserConsole(`${artist.name} - ${albumInfo.title} (${albumInfo.year}) processed`);

		spawn("explorer.exe", [albumInfo.albumPath]);
	}

	async outputTrackWithTagsAndCover(albumInfo, trackInfo) {
		const artist = app.libs._.first(albumInfo.info.artists);
		const albumId = albumInfo.info.id;
		const trackAlbumInfo = trackInfo.info.albums.find(albumInfo => albumInfo.id === albumId);
		const trackPosition = trackAlbumInfo.trackPosition.index;

		const metadata = {
			artist: artist.name,
			album: albumInfo.info.title,
			track: app.libs._.padStart(String(trackPosition), 2, "0"),
			title: trackInfo.info.title,
			genre: capitalizeFirstLetter(albumInfo.info.genre),
			date: albumInfo.info.year
		};

		const tempMp3FilePath = trackInfo.filePath;
		const tempMp3WithTagsFilePath = tempMp3FilePath + ".tags.mp3";

		const fileName = filenamify(`${metadata.track}. ${metadata.artist} - ${metadata.album} (${metadata.date}) - ${metadata.title}.mp3`);
		const filePath = app.path.join(albumInfo.albumPath, fileName);

		const metadataFilePath = app.getUserDataPath("temp", "meta.txt");
		app.fs.outputFileSync(metadataFilePath, formatMetadata(metadata));

		app.fs.ensureDirSync(albumInfo.albumPath);

		// metadata
		await executeShellCommand({ cmd: `ffmpeg -i "${tempMp3FilePath}" -i "${metadataFilePath}" -y -vn -codec:a copy -map_metadata 1 -write_id3v2 1 "${tempMp3WithTagsFilePath}"`, onStdOutData: app.log.info, onStdErrData: app.log.error });

		// cover
		await executeShellCommand({ cmd: `ffmpeg -i "${tempMp3WithTagsFilePath}" -i "${albumInfo.cover.filePath}" -y -map 0:0 -map 1:0 -codec:a copy "${filePath}"`, onStdOutData: app.log.info, onStdErrData: app.log.error });

		// app.fs.removeSync(albumInfo.downloadInfo.tempDirectory);
	}

	async logToConsoleAndToBrowserConsole(log) {
		app.log.info(log);

		await this.page.evaluateInFrame({
			frame: this.page.mainFrame,
			func: log => console.log(log),
			args: [log]
		});
	}
};
