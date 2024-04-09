const ACRONYMS = ["OST", "EP", "LP", "feat.", "prod.", "vs"];

function isLetter(s) {
	return s.length === 1 &&
		s.toLowerCase() !== s.toUpperCase();
}

function isDigit(s) {
	return s.length === 1 &&
		s >= "0" && s <= "9";
}

function isNumeralCounter(s) {
	let i = 0;
	while (i < s.length && isDigit(s[i])) i++;

	if (i === s.length ||
		i === 0) return false;

	if (i < s.length && s[i] === "-") i++;

	if (i === s.length) return false;

	s = s.substring(i).toLowerCase();

	return s === "st" ||
		s === "nd" ||
		s === "rd" ||
		s === "th" ||
		s === "й";
}

function splitToWordsWithSymbols(s) {
	const words = [];
	let word = "";

	let r = 0;
	let l = 0;
	for (; l < s.length; l++) {
		const c = s[l];

		if (isLetter(c) ||
			isDigit(c) ||
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
	const exceptions = app.libs._.get(options, "exceptions", []);
	if (exceptions.includes(s)) return s;

	const parts = splitToWordsWithSymbols(s);
	let result = "";

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if ((part.length === 1 &&
			!isLetter(part[0])) ||
			part.toUpperCase() === part) {
			result += part;
		} else if (isNumeralCounter(part)) {
			result += part.toLowerCase();
		} else {
			result += !ACRONYMS.includes(part) ? app.libs._.capitalize(part) : part;
		}
	}

	return result;
};

module.exports = nameCase;
