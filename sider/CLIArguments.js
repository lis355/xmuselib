module.exports = class CLIArguments {
	constructor() {
		this.args = new Map();
	}

	parseStringArgument(arg) {
		const parts = arg.split("=");
		parts[1] = parts[1] || "";

		this.set(parts[0], parts[1]);
	}

	parseArrayArguments(args) {
		for (const arg of args) {
			this.parseStringArgument(arg);
		}
	}

	set(key, value) {
		if (value === null ||
			value === undefined ||
			value === true ||
			value === "") {
			this.args.set(key, "");
		} else if (value === false) {
			this.remove(key);
		} else {
			this.args.set(key, String(value));
		}
	}

	remove(key) {
		this.args.delete(key);
	}

	toArray() {
		return Array.from(this.args.entries()).map(([key, value]) => value ? `${key}=${value}` : key);
	}
};
