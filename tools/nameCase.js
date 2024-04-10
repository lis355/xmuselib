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

	for (let i = 0; i < s.length; i++) {
		const c = s[i];

		if (c === " " ||
			c === "-") {
			if (word) {
				words.push(word);
				word = "";
			}

			if (c === " " && words.length > 0 && words[words.length - 1] === " ") continue;

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

	const words = splitToWordsWithSymbols(s);

	for (let i = 0; i < words.length; i++) {
		let word = words[i];

		// иногда в названии люди любят писать все или в нижнем или в верхнем регистре
		const upperCase = word === word.toUpperCase();
		const lowerCase = word === word.toLowerCase();

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

		if (ACRONYMS[word.toLowerCase()]) word = ACRONYMS[word.toLowerCase()];
		else if (!isNumeralCounter(word) &&
			!upperCase &&
			!lowerCase) word = app.libs._.capitalize(word);

		if (bracketLeft) word = bracket + word;
		if (bracketRight) word = word + bracket;

		words[i] = word;
	}

	return words.join("");
};

module.exports = nameCase;
