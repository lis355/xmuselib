const { Readable } = require("node:stream");

const byteSize = require("byte-size");
const cliProgress = require("cli-progress");
const ftp = require("basic-ftp");

const LibraryManager = require("./LibraryManager");

const { UPLOADER_TYPES } = app.enums;

class Uploader {
	constructor(info) {
		this.info = info;
	}

	async uploadAlbum(albumInfo) { }
}

class FsUploader extends Uploader {
	getAlbumDestinationFolder(albumInfo) {
		const albumDestinationFolder =
			albumInfo.compilation
				? app.path.posix.join(this.info.root, LibraryManager.LIBRARY_SUBDIRECTORIES.COMPILATIONS, app.tools.filenamify(albumInfo.name))
				: app.path.posix.join(this.info.root, LibraryManager.LIBRARY_SUBDIRECTORIES.ARTISTS, app.tools.filenamify(albumInfo.artist), app.tools.filenamify(albumInfo.name));

		return albumDestinationFolder;
	}

	getCoverDestinationFilePath(albumDestinationFolder) {
		const coverFilePath = app.path.posix.join(albumDestinationFolder, "cover.jpg");

		return coverFilePath;
	}

	getTrackDestinationFilePath(trackInfo, albumDestinationFolder) {
		const trackFileName = app.tools.filenamify(`${app.tools.formatTrackNumber(trackInfo.trackNumber)}. ${trackInfo.artist} - ${trackInfo.albumInfo.name} (${trackInfo.albumInfo.year}) - ${trackInfo.name}.${trackInfo.extension}`);
		const trackFilePath = app.path.posix.join(albumDestinationFolder, trackFileName);

		return trackFilePath;
	}
}

// {
// 	type: "fs",
// 	root: ROOT_FOLDER
// }

class FsDiskUploader extends FsUploader {
	async uploadAlbum(albumInfo) {
		const albumDestinationFolder = this.getAlbumDestinationFolder(albumInfo);

		app.log.info(`Загрузка альбома в локальную библиотеку на диске ${albumDestinationFolder}`);
		app.fs.ensureDirSync(albumDestinationFolder);

		const coverFilePath = this.getCoverDestinationFilePath(albumDestinationFolder);
		app.log.info(`Загрузка обложки ${coverFilePath}`);
		app.fs.writeFileSync(coverFilePath, albumInfo.cover.buffer);
		app.log.info("Завершено");

		for (const trackInfo of albumInfo.trackInfos) {
			const trackFilePath = this.getTrackDestinationFilePath(trackInfo, albumDestinationFolder);
			app.log.info(`Загрузка трека ${trackFilePath}`);
			app.fs.writeFileSync(trackFilePath, trackInfo.buffer);
			app.log.info("Завершено");
		}

		await app.tools.openDirectoryInExplorer(app.path.win32.resolve(albumDestinationFolder));

		app.log.info(`Завершено ${albumDestinationFolder}`);
	}
}

// {
// 	type: "ftp",
// 	host: "HOST",
// 	port: PORT,
// 	root: "/ROOT_FOLDER"
// }

class FtpNetUploader extends FsUploader {
	async uploadAlbum(albumInfo) {
		const client = new ftp.Client();

		// client.ftp.verbose = true;

		await client.access({
			host: this.info.host,
			port: this.info.port
		});

		const albumDestinationFolder = this.getAlbumDestinationFolder(albumInfo);

		app.log.info(`Загрузка альбома на FTP в ${albumDestinationFolder}`);

		await client.ensureDir(albumDestinationFolder);
		await client.cd("/");

		async function uploadFile(sourceBuffer, destinationFilePath) {
			const fileSize = sourceBuffer.length;

			const progressBar = new cliProgress.SingleBar({
				hideCursor: true,
				barCompleteChar: "\u2588",
				barIncompleteChar: "\u2591",
				barsize: 80,
				formatValue: value => byteSize(value),
				format: (options, params, payload) => `${cliProgress.Format.BarFormat(params.progress, options)}| ${(params.progress * 100).toFixed(2).padStart(6, "0")}% | ${options.formatValue(params.value)} / ${options.formatValue(params.total)}`
			});

			client.trackProgress(info => {
				progressBar.update(info.bytes, {});
			});

			progressBar.start(fileSize, 0);

			await client.uploadFrom(Readable.from(sourceBuffer), destinationFilePath);

			progressBar.stop();
		}

		const coverFilePath = this.getCoverDestinationFilePath(albumDestinationFolder);
		app.log.info(`Загрузка обложки ${coverFilePath}`);
		await uploadFile(albumInfo.cover.buffer, coverFilePath);
		app.log.info("Завершено");

		for (const trackInfo of albumInfo.trackInfos) {
			const trackFilePath = this.getTrackDestinationFilePath(trackInfo, albumDestinationFolder);
			app.log.info(`Загрузка трека ${trackFilePath}`);
			await uploadFile(trackInfo.buffer, trackFilePath);
			app.log.info("Завершено");
		}

		client.close();

		await app.tools.openDirectoryInExplorer(`ftp://${this.info.host}:${this.info.port}${albumDestinationFolder}`);

		app.log.info(`Завершено ${albumDestinationFolder}`);
	}
}

module.exports = class UploadManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.createUploaders();
	}

	createUploaders() {
		this.uploaders = app.config.uploaders.map(uploaderInfo => {
			const uploaderType = uploaderInfo.type;
			let uploader;

			switch (uploaderType) {
				case UPLOADER_TYPES.DISK: uploader = new FsDiskUploader(uploaderInfo); break;
				case UPLOADER_TYPES.FTP_NET: uploader = new FtpNetUploader(uploaderInfo); break;
				default: throw new Error(uploaderType);
			}

			return { uploaderType, uploader };
		});

		if (this.uploaders.length === 0) {
			app.log.error("No uploaders, specify them in the config");

			return app.quit();
		}
	}

	async uploadAlbum(albumInfo) {
		for (const { uploader } of this.uploaders) await uploader.uploadAlbum(albumInfo);
	}
};
