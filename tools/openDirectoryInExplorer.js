const { spawn } = require("child_process");

module.exports = async function openDirectoryInExplorer(directory) {
	switch (process.platform) {
		case "linux":
			spawn("xdg-open", [directory], { detached: true }).unref();
			break;
		case "win32":
			return new Promise(resolve => {
				const childProcess = spawn("explorer.exe", [app.path.win32.resolve(directory)]);
				childProcess.on("close", resolve);
			});
		default:
			throw new Error("Unsupported platform");
	}
};
