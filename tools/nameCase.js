const ACRONYMS = ["OST", "EP", "LP", "feat.", "prod.", "vs"];

function isLetter(s) {
	return s.length === 1 &&
		s.toLowerCase() !== s.toUpperCase();
}

// function isInLowerCase(c) {
// 	return isLetter(c) &&
// 		c === c.toLowerCase();
// }

// function isInUpperCase(c) {
// 	return isLetter(c) &&
// 		c === c.toUpperCase();
// }

function splitToWordsWithSymbols(s) {
	const words = [];
	let word = "";

	let r = 0;
	let l = 0;
	for (; l < s.length; l++) {
		const c = s[l];

		if (isLetter(c) ||
			c === "'") continue;
		else {
			word = s.substring(r, l);
			words.push(word);
			words.push(c);

			r = l + 1;
		}
	}

	word = s.substring(r, l);
	words.push(word);

	return words;
}

function nameCase(s, options = null) {
	const acronyms = app.libs._.get(options, "acronyms", []);

	const parts = splitToWordsWithSymbols(s);
	let result = "";

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if ((part.length === 1 &&
			!isLetter(part[0])) ||
			part.toUpperCase() === part) {
			result += part;
		} else {
			result += !ACRONYMS.includes(part) &&
				!acronyms.includes(part) ? app.libs._.capitalize(part) : part;
		}
	}

	return result;
};

module.exports = nameCase;
