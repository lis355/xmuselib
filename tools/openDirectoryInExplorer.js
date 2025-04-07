const { spawn } = require("child_process");

module.exports = async function openDirectoryInExplorer(directory) {
	return new Promise(resolve => {
		const childProcess = spawn("explorer.exe", [directory]);
		childProcess.on("close", resolve);
	});
};
