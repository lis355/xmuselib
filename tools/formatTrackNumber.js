module.exports = function formatTrackNumber(number) {
	return app.libs._.padStart(String(number), 2, "0");
};
