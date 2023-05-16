module.exports = class SiderError extends Error {
	constructor(message, data = {}) {
		super(message);

		this.data = data;
		this.isSiderError = true;
	}
};
