const ACRONYMS = ["OST", "EP", "LP", "feat.", "prod."];

function isLetter(s) {
	return s.length === 1 &&
		s.toLowerCase() !== s.toUpperCase();
}

// function isInLowerCase(c) {
// 	return isLetter(c) &&
// 		c === c.toLowerCase();
// }

function isInUpperCase(c) {
	return isLetter(c) &&
		c === c.toUpperCase();
}

module.exports = function nameCase(s) {
	const words = s.split(" ").map(s => s.trim()).filter(Boolean);

	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		if ((word.length >= 2 &&
			isInUpperCase(word[0]) &&
			isInUpperCase(word[1])) ||
			(word[0] === "(")) {
			// notning
		} else {
			words[i] = !ACRONYMS.includes(word) &&
				!app.config.acronyms.includes(word) ? app.libs._.capitalize(word) : word;
		}
	}

	s = words.join(" ");

	return s;
};
