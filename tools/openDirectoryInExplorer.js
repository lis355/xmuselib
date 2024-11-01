const { spawn } = require("child_process");

module.exports = function openDirectoryInExplorer(directory) {
	spawn("explorer.exe", [app.path.win32.resolve(directory)]);
};
