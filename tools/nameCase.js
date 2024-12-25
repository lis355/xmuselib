const ACRONYMS = {
	"ost": "OST",
	"ep": "EP",
	"lp": "LP",
	"feat.": "feat.",
	"prod.": "prod.",
	"vs": "vs"
};

// function isLetter(s) {
// 	return s.length === 1 &&
// 		s.toLowerCase() !== s.toUpperCase();
// }

function isDigit(s) {
	return s.length === 1 &&
		s >= "0" &&
		s <= "9";
}

function isWhiteSpace(s) {
	return s.length === 1 &&
		s.trim().length === 0;
}

function isNumeralCounter(s) {
	let i = 0;
	while (i < s.length &&
		isDigit(s[i])) i++;

	if (i === s.length ||
		i === 0) return false;

	if (i < s.length &&
		s[i] === "-") i++;

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

	for (let i = 0; i < s.length; i++) {
		let c = s[i];
		const cIsWhiteSpace = isWhiteSpace(c);

		if (cIsWhiteSpace ||
			c === "-") {
			if (word) {
				words.push(word);
				word = "";
			}

			if (cIsWhiteSpace &&
				words.length > 0 &&
				isWhiteSpace(words[words.length - 1])) continue;

			if (cIsWhiteSpace) c = " ";

			words.push(c);
		} else {
			word += c;
		}
	}

	if (word) {
		words.push(word);
		word = "";
	}

	return words;
}

function nameCase(s, options = null) {
	const exceptions = app.libs._.get(options, "exceptions", []);
	if (exceptions.includes(s)) return s;

	// иногда в названии люди любят писать все или в нижнем или в верхнем регистре
	const upperCase = s === s.toUpperCase();
	const lowerCase = s === s.toLowerCase();

	const words = splitToWordsWithSymbols(s);

	for (let i = 0; i < words.length; i++) {
		let word = words[i];
		let bracket;
		let bracketLeft;
		let bracketRight;
		if (word[0] === "(") {
			bracket = "(";
			bracketLeft = true;
			word = word.substring(1);
		} else if (word[0] === "[") {
			bracket = "[";
			bracketLeft = true;
			word = word.substring(1);
		} else if (word[word.length - 1] === ")") {
			bracket = ")";
			bracketRight = true;
			word = word.substring(0, word.length - 1);
		} else if (word[word.length - 1] === "]") {
			bracket = "]";
			bracketRight = true;
			word = word.substring(0, word.length - 1);
		}

		if (upperCase) word = word.toUpperCase();
		else if (lowerCase) word = word.toLowerCase();
		else if (ACRONYMS[word.toLowerCase()]) word = ACRONYMS[word.toLowerCase()];
		else if (!isNumeralCounter(word)) word = app.libs._.capitalize(word);

		if (bracketLeft) word = bracket + word;
		if (bracketRight) word = word + bracket;

		words[i] = word;
	}

	return words.join("");
};

module.exports = nameCase;
