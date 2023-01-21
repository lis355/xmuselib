// https://github.com/lis355/tracktags

const METADATA_HEADER = ";FFMETADATA1";
const NEW_LINE = "\n";

module.exports = function formatMetadata(metadata) {
	return [METADATA_HEADER, ...metadata.mapToArray((key, value) => `${key}=${value}`)].join(NEW_LINE) + NEW_LINE;
};
