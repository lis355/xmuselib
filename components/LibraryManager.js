const sharp = require("sharp");

const NodeID3 = require("../libraries/node-id3");

const LIBRARY_SUBDIRECTORIES = new ndapp.enum([
	"ARTISTS",
	"COMPILATIONS",
	"OST",
	"RINGTONES"
]);

function readTags(trackFilePath) {
	return NodeID3.read(trackFilePath, { noRaw: true });
}

function writeTags(tags, trackFilePath) {
	NodeID3.write(tags, trackFilePath);
}

const EXTENSION_MP3 = ".mp3";
const COVER_JPEG_FILENAME = "cover.jpg";
const COVER_PNG_FILENAME = "cover.png";
const COVER_MAX_SIZE = 500;

class LibraryCache {
	constructor(rootPath) {
		this.dbPath = app.path.posix.join(rootPath, ".cache");

		this.save = app.libs._.debounce(this.save.bind(this), 250, { leading: false });

		this.set = new Set();

		try {
			this.set = new Set(app.tools.json.load(this.dbPath));
		} catch (_) {
		}
	}

	has(hash) {
		return this.set.has(hash);
	}

	cache(hash) {
		this.set.add(hash);

		this.save();
	}

	save() {
		app.tools.json.save(this.dbPath, Array.from(this.set));
	}
}

class LibraryProcessor {
	constructor(rootPath) {
		this.rootPath = rootPath;

		this.cache = new LibraryCache(rootPath);

		try {
			this.settings = app.tools.json.load(app.path.posix.join(this.rootPath, ".settings"));
		} catch (_) {
			this.settings = {};
		}
	}

	async process() {
		await this.processArtistsLibrary();

		await this.processCompilationsAndOSTLibrary();

		app.tools.json.save(app.path.posix.join(this.rootPath, ".info"), {
			name: app.name,
			version: app.version,
			date: app.moment().toString()
		});
	}

	nameCase(name) {
		return app.tools.nameCase(name, this.settings.names);
	}

	filenamify(name) {
		const replaces = app.libs._.get(this.settings.names, "replace", {});
		for (const [key, value] of Object.entries(replaces)) name = name.replace(key, value);

		return app.tools.filenamify(name);
	}

	fileHash(filePath, stats) {
		filePath = filePath.replace(this.rootPath, "");

		return app.tools.hash(filePath, stats.size);
	}

	async processCoverAndGetCoverFilePath(albumFiles) {
		let coverFilePath;
		// let coverHash;

		const coverPngFileInfo = albumFiles.find(fileInfo => fileInfo.fileName.toLowerCase() === COVER_PNG_FILENAME);
		if (coverPngFileInfo) {
			const coverPngImage = await sharp(app.fs.readFileSync(coverPngFileInfo.filePath));
			const coverPngImageMetadata = await coverPngImage.metadata();

			const size = Math.min(COVER_MAX_SIZE, coverPngImageMetadata.width, coverPngImageMetadata.height);

			const imageBuffer = await coverPngImage
				.resize(size, size)
				.jpeg({ quality: 100 })
				.toBuffer();

			app.fs.outputFileSync(app.path.posix.join(coverPngFileInfo.fileDirectory, COVER_JPEG_FILENAME), imageBuffer);
			app.fs.removeSync(coverPngFileInfo.filePath);
		}

		const coverJpgFileInfo = albumFiles.find(fileInfo => fileInfo.fileName.toLowerCase() === COVER_JPEG_FILENAME);
		if (coverJpgFileInfo) {
			const coverJpgFileHash = this.fileHash(coverJpgFileInfo.filePath, coverJpgFileInfo.stats);
			if (!this.cache.has(coverJpgFileHash)) {
				const coverJpgImage = await sharp(app.fs.readFileSync(coverJpgFileInfo.filePath));
				const coverJpgImageMetadata = await coverJpgImage.metadata();

				const size = Math.min(COVER_MAX_SIZE, coverJpgImageMetadata.width, coverJpgImageMetadata.height);
				if (coverJpgImageMetadata.width !== size ||
					coverJpgImageMetadata.height !== size) {
					const imageBuffer = await coverJpgImage
						.resize(size, size)
						.jpeg({ quality: 100 })
						.toBuffer();

					app.fs.outputFileSync(app.path.posix.join(coverJpgFileInfo.fileDirectory, COVER_JPEG_FILENAME), imageBuffer);
				}

				this.cache.cache(coverJpgFileHash);
			}

			coverFilePath = coverJpgFileInfo.filePath;
			// coverHash = hash(app.fs.readFileSync(coverFilePath));
		}

		return coverFilePath;
	}

	async processTrackFileInfo(fileInfo, trackFileName, trackHash, tags) {
		const ALLOWED_TAGS = [
			"artist",
			"album",
			"trackNumber",
			"title",
			"genre",
			"year",
			"image",
			"compilation",
			"unsynchronisedLyrics"
		];

		for (const tagName of Object.keys(tags)) {
			if (!ALLOWED_TAGS.includes(tagName)) app.libs._.unset(tags, tagName);
		}

		let trackFilePath = fileInfo.filePath;

		if (fileInfo.fileName !== trackFileName) {
			trackFilePath = app.path.posix.join(fileInfo.fileDirectory, trackFileName);
			// app.log.info(`Correct filename is ${trackFilePath}`);

			app.fs.copyFileSync(fileInfo.filePath, trackFilePath);
			app.fs.removeSync(fileInfo.filePath);
		}

		writeTags(tags, trackFilePath);

		// app.log.info(`${trackFilePath} processed`);

		this.cache.cache(trackHash);
	}

	async processArtistsLibrary() {
		const artistsLibraryFolder = app.path.posix.join(this.rootPath, LIBRARY_SUBDIRECTORIES.ARTISTS);
		const artistFileInfos = app.tools.getFileInfosFromDirectory(artistsLibraryFolder);
		for (const artistFileInfo of artistFileInfos) {
			const artist = artistFileInfo.fileName;

			if (!artistFileInfo.isDirectory) {
				app.log.error(`Not a directory ${artistFileInfo.filePath}`);

				continue;
			}

			for (const albumFileInfo of app.tools.getFileInfosFromDirectory(artistFileInfo.filePath)) {
				const album = albumFileInfo.fileName;

				app.log.info(`Processing ${artist} - ${album}`);

				if (!albumFileInfo.isDirectory) {
					app.log.error(`Not a directory ${albumFileInfo.filePath}`);

					continue;
				}

				let albumFiles = app.tools.getFileInfosFromDirectory(albumFileInfo.filePath);

				// в альбоме можно держать папку files со всяким барахлом там
				albumFiles = albumFiles.filter(fileInfo => !(fileInfo.isDirectory &&
					fileInfo.fileName === "files"));

				albumFiles
					.forEach(fileInfo => {
						if (!fileInfo.isFile) app.log.error(`Not a file ${fileInfo.filePath}`);
					});

				if (albumFiles.some(fileInfo => fileInfo.isDirectory)) {
					app.log.error(`${albumFileInfo.filePath} contains folders`);

					continue;
				}

				const coverFilePath = await this.processCoverAndGetCoverFilePath(albumFiles);
				if (!coverFilePath) {
					app.log.error(`No cover ${albumFileInfo.filePath}`);

					continue;
				}

				albumFiles = albumFiles.filter(fileInfo => fileInfo.fileName.toLowerCase() !== COVER_JPEG_FILENAME);

				for (const albumItemFileInfo of albumFiles) {
					if (app.path.extname(albumItemFileInfo.fileName).toLowerCase() !== EXTENSION_MP3) {
						app.log.error(`Not a ${EXTENSION_MP3} file ${albumItemFileInfo.filePath}`);

						continue;
					}

					const trackHash = this.fileHash(albumItemFileInfo.filePath, albumItemFileInfo.stats);
					if (this.cache.has(trackHash)) continue;

					const tags = readTags(albumItemFileInfo.filePath);

					tags.artist = this.nameCase(tags.artist);
					if (this.filenamify(tags.artist) !== artist) {
						app.log.error(`Bad artist ${albumItemFileInfo.filePath}, tag artist ${tags.artist}, directory artist ${artist}, safe artist ${this.filenamify(tags.artist)}`);

						continue;
					}

					tags.album = this.nameCase(tags.album);
					if (this.filenamify(tags.album) !== album) {
						app.log.error(`Bad album ${albumItemFileInfo.filePath}, tag album ${tags.album}, directory album ${album}, safe album ${this.filenamify(tags.album)}`);

						continue;
					}

					if (!tags.trackNumber &&
						albumFiles.length === 1) tags.trackNumber = "01";

					if (!Number.isInteger(parseFloat(tags.trackNumber))) {
						app.log.error(`Bad trackNumber ${albumItemFileInfo.filePath}`);

						continue;
					} else {
						tags.trackNumber = app.tools.formatTrackNumber(parseFloat(tags.trackNumber));
					}

					tags.title = this.nameCase(tags.title);
					if (!tags.title) {
						app.log.error(`Bad title ${albumItemFileInfo.filePath}`);

						continue;
					}

					if (tags.year !== undefined &&
						(!Number.isInteger(parseFloat(tags.year)) ||
							!(/\d\d\d\d/.test(tags.year)))) {
						app.log.error(`Bad year ${albumItemFileInfo.filePath}`);

						continue;
					}

					if (tags.genre) tags.genre = this.nameCase(tags.genre);

					// if (!tags.image) {
					// 	app.log.error(`Bad image ${albumItemFileInfo.filePath}`);

					// 	continue;
					// } else {
					// 	const trackCoverHash = hash(tags.image.imageBuffer);
					// 	if (trackCoverHash !== coverHash) {
					// 		app.log.error(`Different image ${albumItemFileInfo.filePath}`);

					// 		continue;
					// 	}
					// }

					tags.image = coverFilePath;

					let trackFileName = `${tags.trackNumber}. ${tags.artist} - ${tags.album}`;
					if (tags.year) trackFileName += ` (${tags.year})`;
					trackFileName += ` - ${tags.title}.mp3`;
					trackFileName = this.filenamify(trackFileName);

					await this.processTrackFileInfo(albumItemFileInfo, trackFileName, trackHash, tags);
				}
			}
		}
	}

	async processCompilationsAndOSTLibrary() {
		await this.processCompilationsDirectory(app.path.posix.join(this.rootPath, LIBRARY_SUBDIRECTORIES.COMPILATIONS), null);
		await this.processCompilationsDirectory(app.path.posix.join(this.rootPath, LIBRARY_SUBDIRECTORIES.OST), null);
	}

	async processCompilationsDirectory(directory, compilationName) {
		const directoryFileInfos = app.tools.getFileInfosFromDirectory(directory);
		if (directoryFileInfos.every(fileInfo => fileInfo.isDirectory)) {
			for (const directoryFileInfo of directoryFileInfos) {
				await this.processCompilationsDirectory(directoryFileInfo.filePath, directoryFileInfo.fileName);
			}
		} else {
			await this.processCompilation(directory, compilationName, directoryFileInfos);
		}
	}

	async processCompilation(directory, compilationName, directoryFileInfos) {
		// в альбоме можно держать папку files со всяким барахлом там
		directoryFileInfos = directoryFileInfos.filter(fileInfo => !(fileInfo.isDirectory &&
			fileInfo.fileName === "files"));

		directoryFileInfos
			.forEach(fileInfo => {
				if (!fileInfo.isFile) app.log.error(`Not a file ${fileInfo.filePath}`);
			});

		if (directoryFileInfos.some(fileInfo => fileInfo.isDirectory)) {
			app.log.error(`${directory} contains folders`);

			return;
		}

		const coverFilePath = await this.processCoverAndGetCoverFilePath(directoryFileInfos);
		if (!coverFilePath) {
			app.log.error(`No cover ${directory}`);

			return;
		}

		directoryFileInfos = directoryFileInfos.filter(fileInfo => fileInfo.fileName.toLowerCase() !== COVER_JPEG_FILENAME);

		for (const directoryFileInfo of directoryFileInfos) {
			if (app.path.extname(directoryFileInfo.fileName).toLowerCase() !== EXTENSION_MP3) {
				app.log.error(`Not a ${EXTENSION_MP3} file ${directoryFileInfo.filePath}`);

				continue;
			}

			const trackHash = this.fileHash(directoryFileInfo.filePath, directoryFileInfo.stats);
			if (this.cache.has(trackHash)) return;

			const tags = readTags(directoryFileInfo.filePath);

			tags.album = this.nameCase(tags.album);
			if (this.filenamify(tags.album) !== compilationName) {
				app.log.error(`Bad album ${directoryFileInfo.filePath}, tag album ${tags.album}, directory album ${compilationName}, safe album ${this.filenamify(tags.album)}`);

				return;
			}

			if (!tags.trackNumber &&
				directoryFileInfos.length === 1) tags.trackNumber = "01";

			if (!Number.isInteger(parseFloat(tags.trackNumber))) {
				app.log.error(`Bad trackNumber ${directoryFileInfo.filePath}`);

				return;
			} else {
				tags.trackNumber = app.tools.formatTrackNumber(parseFloat(tags.trackNumber));
			}

			tags.title = this.nameCase(tags.title);
			if (!tags.title) {
				app.log.error(`Bad title ${directoryFileInfo.filePath}`);

				return;
			}

			if (tags.year !== undefined &&
				(!Number.isInteger(parseFloat(tags.year)) ||
					!(/\d\d\d\d/.test(tags.year)))) {
				app.log.error(`Bad year ${directoryFileInfo.filePath}`);

				return;
			}

			if (tags.genre) tags.genre = this.nameCase(tags.genre);

			// if (!tags.image) {
			// 	app.log.error(`Bad image ${albumItemFileInfo.filePath}`);

			// 	continue;
			// } else {
			// 	const trackCoverHash = hash(tags.image.imageBuffer);
			// 	if (trackCoverHash !== coverHash) {
			// 		app.log.error(`Different image ${albumItemFileInfo.filePath}`);

			// 		continue;
			// 	}
			// }

			tags.image = coverFilePath;

			tags.compilation = "1";

			let trackFileName = `${tags.trackNumber}. ${tags.artist} - ${tags.album}`;
			if (tags.year) trackFileName += ` (${tags.year})`;
			trackFileName += ` - ${tags.title}.mp3`;
			trackFileName = this.filenamify(trackFileName);

			await this.processTrackFileInfo(directoryFileInfo, trackFileName, trackHash, tags);
		}
	}
}

class LibraryManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	async processLibrary(rootPath) {
		const libraryProcessor = new LibraryProcessor(rootPath);
		await libraryProcessor.process();
	}
};

LibraryManager.LIBRARY_SUBDIRECTORIES = LIBRARY_SUBDIRECTORIES;

module.exports = LibraryManager;
