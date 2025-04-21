const NodeID3 = require("../../libraries/node-id3");

function updateTagsInTrackInfo(trackInfo, albumInfo) {
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

module.exports = {
	updateTagsInTrackInfo
};
