const hasha = require("hasha");
const sharp = require("sharp");
const NodeID3 = require("node-id3");

const ARTISTS_SUBDIRECTORY = "ARTISTS";

const EXTENSION_MP3 = ".mp3";
const COVER_MAX_SIZE = 500;

class LibraryManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	async processLibrary(root) {
		let processedLibraryCache = new Set();
		try {
			processedLibraryCache = new Set(app.tools.json.load(app.getUserDataPath("processedLibraryCache.json")));
		} catch (_) {
		}

		const artistsLibraryFolder = app.path.posix.join(root, ARTISTS_SUBDIRECTORY);

		for (const artistFileInfo of app.tools.getFileInfosFromDirectory(artistsLibraryFolder)) {
			// folders with artists
			const artist = artistFileInfo.fileName;

			if (processedLibraryCache.has(artist)) continue;

			if (!artistFileInfo.isDirectory) {
				app.log.info(`Not a directory ${artistFileInfo.filePath}`);

				continue;
			}

			for (const albumFileInfo of app.tools.getFileInfosFromDirectory(artistFileInfo.filePath)) {
				// folders with albums
				const album = albumFileInfo.fileName;

				if (!albumFileInfo.isDirectory) {
					app.log.info(`Not a directory ${albumFileInfo.filePath}`);

					continue;
				}

				// folders with tracks & cover
				let albumFiles = app.tools.getFileInfosFromDirectory(albumFileInfo.filePath);

				albumFiles
					.forEach(fileInfo => {
						if (!fileInfo.isFile) app.log.info(`Not a file ${fileInfo.filePath}`);
					});

				let coverFilePath;
				let coverHash;

				const coverPngFileInfo = albumFiles.find(fileInfo => fileInfo.fileName.toLowerCase() === "cover.png");
				if (coverPngFileInfo) {
					const coverPngImage = await sharp(app.fs.readFileSync(coverPngFileInfo.filePath));
					const coverPngImageMetadata = await coverPngImage.metadata();

					const size = Math.min(COVER_MAX_SIZE, coverPngImageMetadata.width, coverPngImageMetadata.height);

					const imageBuffer = await coverPngImage
						.resize(size, size)
						.jpeg({ quality: 100 })
						.toBuffer();

					app.fs.outputFileSync(app.path.posix.join(coverPngFileInfo.fileDirectory, "cover.jpg"), imageBuffer);
					app.fs.removeSync(coverPngFileInfo.filePath);

					albumFiles = app.tools.getFileInfosFromDirectory(albumFileInfo.filePath);
				}

				const coverJpgFileInfo = albumFiles.find(fileInfo => fileInfo.fileName.toLowerCase() === "cover.jpg");
				if (coverJpgFileInfo) {
					const coverJpgImage = await sharp(app.fs.readFileSync(coverJpgFileInfo.filePath));
					const coverJpgImageMetadata = await coverJpgImage.metadata();

					const size = Math.min(COVER_MAX_SIZE, coverJpgImageMetadata.width, coverJpgImageMetadata.height);
					if (coverJpgImageMetadata.width !== size ||
						coverJpgImageMetadata.height !== size) {
						const imageBuffer = await coverJpgImage
							.resize(size, size)
							.jpeg({ quality: 100 })
							.toBuffer();

						app.fs.outputFileSync(app.path.posix.join(coverJpgFileInfo.fileDirectory, "cover.jpg"), imageBuffer);
					}

					coverFilePath = coverJpgFileInfo.filePath;
					coverHash = hasha(app.fs.readFileSync(coverFilePath), { algorithm: "md5" });
				}

				if (!coverFilePath) {
					app.log.info(`No cover ${albumFileInfo.filePath}`);

					continue;
				}

				for (const albumItemFileInfo of albumFiles) {
					if (albumItemFileInfo.fileName.toLowerCase() === "cover.jpg") continue;

					if (app.path.extname(albumItemFileInfo.fileName).toLowerCase() !== EXTENSION_MP3) {
						app.log.info(`Not a ${EXTENSION_MP3} file ${albumItemFileInfo.filePath}`);

						continue;
					}

					const tags = NodeID3.read(albumItemFileInfo.filePath);

					let tagsError;
					let correctArtist;
					let correctAlbum;
					let correctTrackNumber;
					let correctTitle;
					let correctYear;
					let correctFileName;

					tags.artist = app.tools.nameCase(tags.artist);
					tags.album = app.tools.nameCase(tags.album);
					tags.title = app.tools.nameCase(tags.title);
					if (tags.genre) tags.genre = app.tools.nameCase(tags.genre);

					if (app.tools.filenamify(app.tools.nameCase(tags.artist)) !== artist) {
						tagsError = true;

						app.log.info(`Bad artist ${albumItemFileInfo.filePath}`);
					} else {
						correctArtist = true;
					}

					if (app.tools.filenamify(tags.album) !== album) {
						tagsError = true;

						app.log.info(`Bad album ${albumItemFileInfo.filePath}`);
					} else {
						correctAlbum = true;
					}

					if (!Number.isInteger(parseFloat(tags.trackNumber))) {
						tagsError = true;

						app.log.info(`Bad trackNumber ${albumItemFileInfo.filePath}`);
					} else {
						correctTrackNumber = true;

						tags.trackNumber = app.libs._.padStart(String(tags.trackNumber), 2, "0");
					}

					if (!tags.title) {
						tagsError = true;

						app.log.info(`Bad title ${albumItemFileInfo.filePath}`);
					} else {
						correctTitle = true;
					}

					// if (!tags.genre) {
					// 	tagsError = true;

					// 	app.log.info(`Bad genre ${albumItemFileInfo.filePath}`);
					// }

					if (tags.year !== undefined &&
						(!Number.isInteger(parseFloat(tags.year)) ||
							!(/\d\d\d\d/.test(tags.year)))) {
						tagsError = true;

						app.log.info(`Bad year ${albumItemFileInfo.filePath}`);
					} else {
						correctYear = true;
					}

					if (!tags.image) {
						tagsError = true;

						app.log.info(`Bad image ${albumItemFileInfo.filePath}`);
					} else {
						const trackCoverHash = hasha(tags.image.imageBuffer, { algorithm: "md5" });
						if (trackCoverHash !== coverHash) {
							tagsError = true;

							// app.log.info(`Different image ${albumItemFileInfo.filePath}`);
						}
					}

					continue;

					let trackFileName = `${tags.trackNumber}. ${tags.artist} - ${tags.album}`;
					if (tags.year !== undefined) trackFileName += ` (${tags.year})`;
					trackFileName += ` - ${tags.title}.mp3`;
					trackFileName = app.tools.filenamify(trackFileName);

					if (albumItemFileInfo.fileName !== trackFileName) {
						tagsError = true;

						// app.log.info(`Bad file name ${albumItemFileInfo.filePath}`);
					} else {
						correctFileName = true;
					}

					const tagNames = new Set(Object.keys(tags));

					tagNames.delete("raw");
					tagNames.delete("artist");
					tagNames.delete("album");
					tagNames.delete("trackNumber");
					tagNames.delete("title");
					tagNames.delete("genre");
					tagNames.delete("year");
					tagNames.delete("image");

					const specialTags = {};
					if (tagNames.has("unsynchronisedLyrics")) {
						specialTags.unsynchronisedLyrics = tags.unsynchronisedLyrics;
						tagNames.delete("unsynchronisedLyrics");
					}

					if (tagNames.size > 0) {
						tagsError = true;

						app.log.info(`Other tags ${Array.from(tagNames).join(", ")} in ${albumItemFileInfo.filePath}`);
					}

					if (tagsError) {
						if (correctArtist &&
							correctAlbum &&
							correctTrackNumber &&
							correctTitle &&
							correctYear &&
							coverFilePath) {
							const correctTags = {
								...specialTags,
								artist: tags.artist,
								album: tags.album,
								trackNumber: tags.trackNumber,
								title: tags.title,
								genre: tags.genre,
								year: tags.year,
								image: coverFilePath
							};

							let trackFilePath = albumItemFileInfo.filePath;

							if (!correctFileName) {
								trackFilePath = app.path.posix.join(albumItemFileInfo.fileDirectory, trackFileName);
								app.log.info(`Correct filename is ${trackFilePath}`);

								app.fs.copyFileSync(albumItemFileInfo.filePath, trackFilePath);
								app.fs.removeSync(albumItemFileInfo.filePath);
							}

							NodeID3.write(correctTags, trackFilePath);
						} else {
							app.log.info(`Bad file ${albumItemFileInfo.filePath}`);
						}
					}
				}
			}

			processedLibraryCache.add(artist);
			app.tools.json.save(app.getUserDataPath("processedLibraryCache.json"), Array.from(processedLibraryCache));
		}
	}
};

LibraryManager.ARTISTS_SUBDIRECTORY = ARTISTS_SUBDIRECTORY;

module.exports = LibraryManager;
