class MediaBufferCache {
	setBuffer(bufferId, buffer) {
		const filePath = this.getFilePath(bufferId);

		app.fs.outputFileSync(filePath, buffer);
	}

	getBuffer(bufferId) {
		const filePath = this.getFilePath(bufferId);

		if (!app.fs.existsSync(filePath)) return null;

		return app.fs.readFileSync(filePath);
	}

	getFilePath(bufferId) {
		const fileName = app.tools.hash(bufferId);
		const filePath = app.path.resolve(app.getTempPath(), "mediaCache", fileName);

		return filePath;
	}

	isUseCache() {
		return process.env.DEBUG_MEDIA_BUFFER_CACHE === "true";
	}

	async getMediaBuffer(asyncBufferGetter, bufferRef) {
		let buffer;

		if (this.isUseCache()) {
			buffer = this.getBuffer(bufferRef);

			if (buffer) {
				app.logsManager.log(`[${this.constructor.name}]: ${bufferRef} loaded from cache`);

				return buffer;
			}
		}

		buffer = await asyncBufferGetter(bufferRef);

		if (this.isUseCache()) {
			this.setBuffer(bufferRef, buffer);

			app.logsManager.log(`[${this.constructor.name}]: ${bufferRef} saved to cache`);
		}

		return buffer;
	}
}

module.exports = new MediaBufferCache();
