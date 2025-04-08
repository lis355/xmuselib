const ACRONYMS = {
	"ost": "OST",
	"ep": "EP",
	"lp": "LP",
	"feat.": "feat.",
	"prod.": "prod.",
	"vs.": "vs.",
	"vs": "vs"
};

function isLetter(s) {
	return s.length === 1 &&
		s.toLowerCase() !== s.toUpperCase();
}

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

const SYMBOLS_BREAK_WORDS = ["-"];
const SUMBOL_WHITE_SPACE = " ";

function splitToWordsWithSymbols(s) {
	const words = [];
	let word = "";

	for (let i = 0; i < s.length; i++) {
		let symbol = s[i];
		const symbolIsWhiteSpace = isWhiteSpace(symbol);

		if (symbolIsWhiteSpace ||
			SYMBOLS_BREAK_WORDS.includes(symbol)) {
			if (word) {
				words.push(word);
				word = "";
			}

			if (symbolIsWhiteSpace &&
				words.length > 0 &&
				isWhiteSpace(words[words.length - 1])) continue;

			if (symbolIsWhiteSpace) symbol = SUMBOL_WHITE_SPACE;

			words.push(symbol);
		} else {
			word += symbol;
		}
	}

	if (word) {
		words.push(word);
		word = "";
	}

	return words;
}

function capitalize(s) {
	let result = "";
	let first = true;

	for (let i = 0; i < s.length; i++) {
		let symbol = s[i];
		if (isLetter(symbol)) {
			if (first) {
				first = false;

				symbol = symbol.toUpperCase();
			} else {
				symbol = symbol.toLowerCase();
			}
		}

		result += symbol;
	}

	return result;
}

function nameCase(s, options = null) {
	const exceptions = app.libs._.get(options, "exceptions", []);
	if (exceptions.includes(s)) return s;

	// иногда в названии люди любят писать все или в нижнем или в верхнем регистре
	// если все в верхнем регистре или все в нижнем регистре - все оставляем в этом регистре

	// если регистр намешан, то мы капитализируем все слова, кроме слов, которые полностью в верхнем регистре

	const upperCase = s === s.toUpperCase();
	const lowerCase = s === s.toLowerCase();

	const words = splitToWordsWithSymbols(s);

	for (let i = 0; i < words.length; i++) {
		let word = words[i];
		const wordUpperCase = word.toUpperCase();
		const wordLowerCase = word.toLowerCase();

		if (words.length > 1 &&
			upperCase) word = wordUpperCase;
		else if (words.length > 1 &&
			lowerCase) word = wordLowerCase;
		else if (ACRONYMS[wordLowerCase]) word = ACRONYMS[wordLowerCase];
		else if (isNumeralCounter(wordLowerCase)) word = wordLowerCase;
		else if (word === wordUpperCase) word = wordUpperCase;
		else word = capitalize(word);

		words[i] = word;
	}

	s = words.join("");

	return s;
};

module.exports = nameCase;
