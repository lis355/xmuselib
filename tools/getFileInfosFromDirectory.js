module.exports = function getFileInfosFromDirectory(directory) {
	const stats = app.fs.statSync(directory);
	if (!stats.isDirectory()) throw new Error(`${directory} is not a directory`);

	return app.fs.readdirSync(directory)
		.map(fileName => {
			const filePath = app.path.posix.join(directory, fileName);
			const stats = app.fs.statSync(filePath);

			return {
				fileName,
				fileDirectory: directory,
				filePath,
				stats,
				isDirectory: stats.isDirectory(),
				isFile: stats.isFile()
			};
		});
};
