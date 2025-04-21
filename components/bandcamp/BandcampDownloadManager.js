const sharp = require("sharp");

const { CoverInfo, TrackInfo, AlbumInfo, getTrackInfoText, getAlbumInfoText } = require("../entities/EntityInfos");
const { updateTagsInTrackInfo } = require("../../tools/tags");
const formatSize = require("../../tools/formatSize");

function tryParseJson(data) {
	try {
		return JSON.parse(data);
	} catch (e) {
		return null;
	}
}

class BandcampCoverInfo extends CoverInfo {
	constructor(url, entityInfo) {
		super();

		this.url = url;
		this.entityInfo = entityInfo;

		this.buffer = null;
	}
}

class BandcampTrackInfo extends TrackInfo {
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

class BandcampAlbumInfo extends AlbumInfo {
	constructor({ id, coverUrl, artist, name, genre, year, isCompilation = false }) {
		super();

		this.id = id;

		this.cover = new BandcampCoverInfo(coverUrl, this);

		this.artist = app.tools.nameCase(artist);
		this.name = app.tools.nameCase(name);
		this.genre = app.tools.nameCase(genre);
		this.year = year;
		this.isCompilation = isCompilation;

		this.trackInfos = [];
	}
}

module.exports = class BandcampDownloadManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();
	}

	async getAlbumInfoWithTrackInfos(albumUrl) {
		app.logsManager.log(`Start fetch album information ${albumUrl}`);

		const response = await fetch(albumUrl);
		const responseBuffer = Buffer.from(await response.arrayBuffer());

		const html = responseBuffer.toString();

		// NOTE very long loading library
		const jsdom = require("jsdom");

		const dom = new jsdom.JSDOM(html);
		const albumData = app.libs._.first(
			Array.from(dom.window.document.head.children)
				.filter(element => element.type === "text/javascript")
				.map(element =>
					element.getAttributeNames()
						.filter(name => name.includes("data"))
						.map(name => element.getAttribute(name))
						.map(tryParseJson)
						.filter(Boolean)
						.find(data => data["item_type"] === "album")
				)
				.filter(Boolean)
		);

		// app.tools.json.save(app.getUserDataPath("tmp.json"), albumData);

		// const albumData = app.tools.json.load(app.getUserDataPath("tmp.json"));

		let albumInfo;

		if (albumData) {
			const coverUrl = dom.window.document.querySelector("#tralbumArt [href]").getAttribute("href");

			albumInfo = new BandcampAlbumInfo({
				id: albumData.id,
				coverUrl,
				artist: albumData.artist,
				name: albumData.current.title,
				genre: "",
				year: app.moment(albumData["album_release_date"]).year(),
				isCompilation: false
			});

			albumInfo.trackInfos = albumData.trackinfo.map(trackData => {
				return new BandcampTrackInfo({
					albumInfo,
					id: trackData.id,
					artist: albumInfo.artist,
					name: trackData.title,
					trackNumber: trackData["track_num"],
					url: trackData.file["mp3-128"],
					extension: "mp3"
				});
			});
		}

		app.logsManager.log(`Finish fetch album information ${albumUrl}`);

		return albumInfo;
	}

	async downloadTrack(trackInfo) {
		app.logsManager.log(`Start downloading track ${getTrackInfoText(trackInfo)}`);

		let buffer;
		let extension = trackInfo.extension;

		const response = await fetch(trackInfo.url);
		const responseBuffer = Buffer.from(await response.arrayBuffer());

		buffer = responseBuffer;

		// app.fs.writeFileSync(app.getUserDataPath("test.mp3"), responseBuffer);

		// buffer = app.fs.readFileSync(app.getUserDataPath("test.mp3"));

		trackInfo.buffer = buffer;
		trackInfo.extension = extension;

		app.logsManager.log(`Finish downloading track ${getTrackInfoText(trackInfo)}, ${formatSize(responseBuffer.byteLength)}`);
	}

	async downloadCover(coverInfo) {
		app.logsManager.log(`Start downloading cover ${getAlbumInfoText(coverInfo.entityInfo)}`);

		let imageBuffer;

		const response = await fetch(coverInfo.url);
		const responseBuffer = Buffer.from(await response.arrayBuffer());

		imageBuffer = await sharp(responseBuffer)
			.resize(CoverInfo.DEFAULT_COVER_SIZE, CoverInfo.DEFAULT_COVER_SIZE)
			.jpeg({ quality: 100 })
			.toBuffer();

		// app.fs.writeFileSync(app.getUserDataPath("cover.jpg"), imageBuffer);

		// imageBuffer = app.fs.readFileSync(app.getUserDataPath("cover.jpg"));

		coverInfo.buffer = imageBuffer;

		app.logsManager.log(`Finish downloading cover ${getAlbumInfoText(coverInfo.entityInfo)}, ${formatSize(imageBuffer.byteLength)}`);
	}

	async runAutomationDownloadAlbumsAndQuit(options) {
		const albumUrls = app.libs._.get(options, "albums")
			.split(",");

		for (const albumUrl of albumUrls) {
			const albumInfo = await this.getAlbumInfoWithTrackInfos(albumUrl);
			if (!albumInfo) throw new Error(`Invalid album url ${albumUrl}`);
			// app.tools.json.save(app.getUserDataPath("albumInfo.json"), albumInfo);

			await this.downloadCover(albumInfo.cover);
			// app.fs.writeFileSync(app.getUserDataPath("cover.jpg"), albumInfo.cover.buffer);

			for (const trackInfo of albumInfo.trackInfos) {
				await this.downloadTrack(trackInfo);
				updateTagsInTrackInfo(trackInfo, albumInfo);
				// app.fs.writeFileSync(app.getUserDataPath("track.mp3"), trackInfo.buffer);
			}

			await app.uploadManager.uploadAlbum(albumInfo);
		}

		app.quit();
	}
};
