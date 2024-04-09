const filenamifyLibrary = require("filenamify");

module.exports = function (path) {
	return filenamifyLibrary(path, { maxLength: 1024, replacement: "" }).replace(/  +/g, " ");
};
