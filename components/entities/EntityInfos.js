class EntityInfo { }

class CoverInfo extends EntityInfo {
	constructor() {
		super();

		this.buffer = null;
	}
}

CoverInfo.DEFAULT_COVER_SIZE = 400;

class TrackInfo extends EntityInfo {
	constructor(albumInfo, trackNumber) {
		super();

		this.albumInfo = albumInfo;
		this.trackNumber = trackNumber;

		this.artist = null;
		this.name = null;

		this.buffer = null;
		this.extension = null;
	}
}

class AlbumInfo extends EntityInfo {
	constructor() {
		super();

		this.cover = null; // CoverInfo

		this.artist = null;
		this.name = null;
		this.genre = null;
		this.year = 0;
		this.isCompilation = false;

		this.trackInfos = []; // TrackInfo
	}
}

function getTrackInfoText(trackInfo) {
	return `${trackInfo.artist} - ${trackInfo.name}`;
}

function getAlbumInfoText(albumInfo) {
	return `${albumInfo.artist} - ${albumInfo.name} (${albumInfo.year})`;
}

module.exports = {
	EntityInfo,
	CoverInfo,
	TrackInfo,
	AlbumInfo,

	getTrackInfoText,
	getAlbumInfoText
};
