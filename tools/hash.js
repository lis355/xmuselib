const crypto = require("node:crypto");

// What is the fastest node.js hashing algorithm
// https://medium.com/@chris_72272/what-is-the-fastest-node-js-hashing-algorithm-c15c1a0e164e

module.exports = function hash(...objects) {
	const hash = crypto.createHash("sha1");

	for (const object of objects) {
		let transformedObject = null;

		if (Buffer.isBuffer(object)) {
			transformedObject = object;
		} else {
			transformedObject = String(object);
		}

		hash.update(transformedObject);
	}

	const digest = hash.digest("hex");

	return digest;
};
