const { Jimp } = require("jimp");

module.exports = class JpegBufferImage {
	static async fromBuffer(buffer) {
		const bufferJpegImage = new JpegBufferImage();
		bufferJpegImage.img = await Jimp.read(buffer);

		return bufferJpegImage;
	}

	get width() {
		return this.img.bitmap.width;
	}

	get height() {
		return this.img.bitmap.height;
	}

	resize(width, height) {
		this.img.resize({ w: width, h: height });

		return this;
	}

	async getJpegBuffer() {
		const buffer = await this.img.getBuffer("image/jpeg");

		return buffer;
	}
};
