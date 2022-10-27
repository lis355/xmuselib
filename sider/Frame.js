module.exports = class Frame {
	constructor(page, frameId, parentFrameId) {
		this.page = page;
		this.id = frameId;
		this.parentFrameId = parentFrameId;
		this.info = {};
	}

	get name() {
		return this.info.name || "";
	}

	get url() {
		return this.info.url || "";
	}

	get executionContext() {
		return this.page.executionContextsByFrameId.get(this.id);
	}

	get childFrames() {
		return this.page.getFrames(frame => frame.parentFrameId === this.id);
	}

	get parentFrame() {
		return app.libs._.first(this.page.getFrames(frame => frame.id === this.parentFrameId));
	}
};
