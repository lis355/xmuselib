const { expect, test } = require("@jest/globals");

const ndapp = require("ndapp");

test("nameCase", () => {
	ndapp({
		tools: {
			nameCase: require("./nameCase")
		},
		onRun: async () => {
			expect(app.tools.nameCase("Деревянные  киты")).toEqual("Деревянные Киты");
			expect(app.tools.nameCase("Деревянные\nкиты")).toEqual("Деревянные Киты");
			expect(app.tools.nameCase("Деревянные\tкиты")).toEqual("Деревянные Киты");
			expect(app.tools.nameCase("Деревянные\t\nкиты")).toEqual("Деревянные Киты");
			expect(app.tools.nameCase("деревянные киты")).toEqual("деревянные киты");
			expect(app.tools.nameCase("ДЕРЕВЯННЫЕ КИТЫ")).toEqual("ДЕРЕВЯННЫЕ КИТЫ");
		}
	});
});
