module.exports = function formatSize(bytesAmount) {
	return (bytesAmount / 1024 ** 2).toFixed(2) + " Mb";
};
