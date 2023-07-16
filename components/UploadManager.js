const { spawn } = require("child_process");

const ftp = require("basic-ftp");

const LibraryManager = require("./LibraryManager");

const { UPLOADER_TYPES } = app.enums;

class Uploader {
	constructor(info) {
		this.info = info;
	}

	async uploadAlbum(albumInfo, trackInfos) { }
}

// {
// 	type: "fs",
// 	root: ROOT_FOLDER
// }

class FsDiskUploader extends Uploader {
	async uploadAlbum(albumInfo, trackInfos) {
		const albumDestinationFolder =
			albumInfo.compilation
				? app.path.posix.join(this.info.root, LibraryManager.LIBRARY_SUBDIRECTORIES.COMPILATIONS, app.tools.filenamify(albumInfo.info.name))
				: app.path.posix.join(this.info.root, LibraryManager.LIBRARY_SUBDIRECTORIES.ARTISTS, app.tools.filenamify(albumInfo.info.artist), app.tools.filenamify(albumInfo.info.name));

		app.log.info(`Загрузка альбома в локальную библиотеку на диске ${albumDestinationFolder}`);

		app.fs.ensureDirSync(albumDestinationFolder);

		const coverFilePath = app.path.posix.join(albumDestinationFolder, app.path.basename(albumInfo.cover.outFilePath));
		app.log.info(`Загрузка обложки ${coverFilePath}`);
		app.fs.copySync(albumInfo.cover.outFilePath, coverFilePath);
		app.log.info("Завершено");

		for (const trackInfo of trackInfos) {
			const trackFilePath = app.path.posix.join(albumDestinationFolder, app.path.basename(trackInfo.outFilePath));
			app.log.info(`Загрузка трека ${trackFilePath}`);
			app.fs.copySync(trackInfo.outFilePath, trackFilePath);
			app.log.info("Завершено");
		}

		spawn("explorer.exe", [app.path.win32.resolve(albumDestinationFolder)]);

		app.log.info(`Завершено ${albumDestinationFolder}`);
	}
}

// {
// 	type: "ftp",
// 	host: "HOST",
// 	port: PORT,
// 	root: "/ROOT_FOLDER"
// }

class FtpNetUploader extends Uploader {
	async uploadAlbum(albumInfo, trackInfos) {
		const client = new ftp.Client();

		// client.ftp.verbose = true;

		await client.access({
			host: this.info.host,
			port: this.info.port
		});

		const albumDestinationFolder =
			albumInfo.compilation
				? app.path.posix.join(this.info.root, LibraryManager.LIBRARY_SUBDIRECTORIES.COMPILATIONS, app.tools.filenamify(albumInfo.info.name))
				: app.path.posix.join(this.info.root, LibraryManager.LIBRARY_SUBDIRECTORIES.ARTISTS, app.tools.filenamify(albumInfo.info.artist), app.tools.filenamify(albumInfo.info.name));

		app.log.info(`Загрузка альбома на FTP в ${albumDestinationFolder}`);

		await client.ensureDir(albumDestinationFolder);
		await client.cd("/");

		async function uploadFile(fromFilePath, toFilePath) {
			const fileSize = app.fs.statSync(fromFilePath).size;

			client.trackProgress(info => {
				app.log.info(`${info.name} ${app.libs._.round(info.bytes / fileSize * 100, 2).toFixed(2)}% [${info.bytes}/${fileSize}]`);
			});

			await client.uploadFrom(fromFilePath, toFilePath);
		}

		const coverFilePath = app.path.posix.join(albumDestinationFolder, app.path.basename(albumInfo.cover.outFilePath));
		app.log.info(`Загрузка обложки ${coverFilePath}`);
		await uploadFile(albumInfo.cover.outFilePath, coverFilePath);
		app.log.info("Завершено");

		for (const trackInfo of trackInfos) {
			const trackFilePath = app.path.posix.join(albumDestinationFolder, app.path.basename(trackInfo.outFilePath));
			app.log.info(`Загрузка трека ${trackFilePath}`);
			await uploadFile(trackInfo.outFilePath, trackFilePath);
			app.log.info("Завершено");
		}

		client.close();

		spawn("explorer.exe", [`ftp://${this.info.host}:${this.info.port}${albumDestinationFolder}`]);

		app.log.info(`Завершено ${albumDestinationFolder}`);
	}
}

module.exports = class UploadManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.createUploaders();
	}

	async createUploaders() {
		this.uploaders = app.config.upload.mapToObject(uploaderInfo => {
			const uploaderInfoType = uploaderInfo.type;
			let uploader;

			switch (uploaderInfoType) {
				case UPLOADER_TYPES.DISK: uploader = new FsDiskUploader(uploaderInfo); break;
				case UPLOADER_TYPES.FTP_NET: uploader = new FtpNetUploader(uploaderInfo); break;
				default: throw new Error(uploaderInfoType);
			}

			return { key: uploaderInfoType, value: uploader };
		});
	}

	async uploadAlbum(albumInfo, trackInfos) {
		for (const uploader of Object.values(this.uploaders)) await uploader.uploadAlbum(albumInfo, trackInfos);
	}
};
