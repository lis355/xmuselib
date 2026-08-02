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
		const fileName = bufferId;
		const filePath = app.path.join(this.getCacheDir(), fileName);

		return filePath;
	}

	getCacheDir() {
		const cacheDir = app.path.resolve(app.getTempPath(), "mediaCache");

		return cacheDir;
	}

	initialize(config) {
		this.config = config || {};
		this.config.ttlInSeconds = this.config.ttlInSeconds || 60 * 60; // 1 hour

		if (this.isUseCache()) {
			this.clearExpired(this.config.ttlInSeconds);
		}
	}

	clearExpired(ttlInSeconds) {
		const cacheDir = this.getCacheDir();

		// app.fs.removeSync(cacheDir);

		if (!app.fs.existsSync(cacheDir)) return;

		const now = Date.now();

		for (const file of app.fs.readdirSync(cacheDir)) {
			const filePath = app.path.resolve(cacheDir, file);
			const stat = app.fs.statSync(filePath);

			if (now - stat.mtimeMs > ttlInSeconds * 1000) {
				app.fs.removeSync(filePath);

				app.logsManager.log(`[${this.constructor.name}]: removed olded ${file} from cache`);
			}
		}
	}

	isUseCache() {
		return process.env.DEBUG_MEDIA_BUFFER_CACHE === "true";
	}

	cachify(asyncBufferGetter) {
		if (typeof asyncBufferGetter !== "function") throw new Error("asyncBufferGetter must be a function");

		return this.cache.bind(this, asyncBufferGetter);
	}

	async cache(asyncBufferGetter, ...args) {
		const argsHash = app.tools.hash(...args);

		let buffer = null;

		if (this.isUseCache()) {
			buffer = this.getBuffer(argsHash);

			if (buffer) {
				app.logsManager.log(`[${this.constructor.name}]: ${args.map(String).join(",")} loaded from cache`);

				return buffer;
			}
		}

		buffer = await asyncBufferGetter(...args);

		if (this.isUseCache()) {
			this.setBuffer(argsHash, buffer);

			this.writeCacheInfo(args, argsHash, buffer);

			app.logsManager.log(`[${this.constructor.name}]: ${args.map(String).join(",")} saved to cache`);
		}

		return buffer;
	};

	writeCacheInfo(args, argsHash, buffer) {
		const info = {
			args: args.map(String),
			argsHash,
			buffer: {
				size: `${buffer.length} (${app.tools.formatSize(buffer.length)})`,
				hash: app.tools.hash(buffer)
			}
		};

		const filePath = this.getFilePath(argsHash) + ".info.json";
		app.tools.json.save(filePath, info);

		// let infos;

		// const infoFilePath = app.path.resolve(this.getCacheDir(), "info.json");
		// if (app.fs.existsSync(infoFilePath)) infos = app.tools.json.load(infoFilePath);
		// else infos = [];

		// infos.push(info);

		// app.tools.json.save(infoFilePath, infos);
	}
}

module.exports = new MediaBufferCache();
