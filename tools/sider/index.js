const Browser = require("./Browser");
const CLIArguments = require("./CLIArguments");

// NOTE minimize browser hack
// setTimeout(async () => {
// 	const result = await this.pages.values().next().value.cdp.send("Browser.getWindowForTarget");
// 	await this.cdp.rootSession.send("Browser.setWindowBounds", { windowId: result.windowId, bounds: { windowState: "minimized" } });
// }, 500);

module.exports = {
	Browser,
	CLIArguments
};
