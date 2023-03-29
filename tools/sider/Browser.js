const { spawn } = require("child_process");
const readline = require("readline");
const EventEmitter = require("events");

const { CDP } = require("./CDP");
const Page = require("./Page");

async function getWSEndpoint(browserProcess) {
	return new Promise((resolve, reject) => {
		const stdErrReader = readline.createInterface({ input: browserProcess.stderr });

		const handleOnLine = line => {
			const match = line.match(/^DevTools listening on (ws:\/\/.*)$/);
			if (!match) return;

			stdErrReader.off("line", handleOnLine);
			stdErrReader.off("close", reject);
			stdErrReader.off("exit", reject);
			stdErrReader.off("error", reject);

			return resolve(match[1]);
		};

		stdErrReader.on("line", handleOnLine);
		stdErrReader.on("close", reject);
		stdErrReader.on("exit", reject);
		stdErrReader.on("error", reject);
	});
}

module.exports = class Browser extends EventEmitter {
	constructor(options = {}) {
		super();

		this.options = options;
	}

	async launch(options) {
		options.args.set("--remote-debugging-port", 0);

		// app.log.info(`BROWSER ${options.executablePath}${app.os.EOL}${options.args.toArray().join(app.os.EOL)}`);

		this.browserProcess = spawn(options.executablePath, options.args.toArray(), {
			// env: process.env
		});

		this.browserProcess.on("close", this.processClosed.bind(this));

		// TODO
		// this.browserProcess.on("disconnect", () => {
		// });

		// this.browserProcess.on("exit", (code, signal) => {
		// });

		// this.browserProcess.on("error", error => {
		// 	throw error;
		// });

		this.wsEndpoint = await getWSEndpoint(this.browserProcess);
	}

	async connect(wsEndpoint) {
		this.wsEndpoint = wsEndpoint;
	}

	async initialize() {
		this.pages = new Map();

		this.cdp = new CDP(this, this.wsEndpoint);
		await this.cdp.initialize();

		this.cdp.on("closed", this.processClosed.bind(this));

		this.programOpenPage = 1;
		this.programClosePage = 0;

		this.cdp.rootSession.on("targetCreated", async target => {
			switch (target.targetInfo.type) {
				case "page": {
					const page = new Page(this, target);
					await page.initialize();

					this.pages.set(page.target.targetId, page);

					let reason = "user";
					if (this.programOpenPage > 0) {
						this.programOpenPage--;

						reason = "program";
					}

					this.emit("pageAdded", page, reason);

					break;
				}

				default:
					break;
			}
		});

		this.cdp.rootSession.on("targetDestroyed", async target => {
			switch (target.targetInfo.type) {
				case "page": {
					const targetId = target.targetId;
					const page = this.pages.get(targetId);
					this.pages.delete(targetId);

					let reason = "user";
					if (this.programClosePage > 0) {
						this.programClosePage--;

						reason = "program";
					}

					this.emit("pageRemoved", page, reason);

					break;
				}

				default:
					break;
			}
		});

		// this.cdp.rootSession.on("targetCrashed", async target => {
		// 	switch (target.targetInfo.type) {
		// 		case "page": {
		// 			const targetId = target.targetId;
		// 			const page = this.pages.get(targetId);

		// 			break;
		// 		}

		// 		default:
		// 			break;
		// 	}
		// });

		// this.cdp.rootSession.on("targetInfoChanged", async target => {
		// 	switch (target.targetInfo.type) {
		// 		case "page": {
		// 			const targetId = target.targetId;
		// 			const page = this.pages.get(targetId);

		// 			break;
		// 		}

		// 		default:
		// 			break;
		// 	}
		// });

		// this.cdp.rootSession.on("attachedToTarget", async target => {
		// 	switch (target.targetInfo.type) {
		// 		case "page": {
		// 			const targetId = target.targetId;
		// 			const page = this.pages.get(targetId);

		// 			break;
		// 		}

		// 		default:
		// 			break;
		// 	}
		// });

		// this.cdp.rootSession.on("detachedFromTarget", async target => {
		// 	switch (target.targetInfo.type) {
		// 		case "page": {
		// 			const targetId = target.targetId;
		// 			const page = this.pages.get(targetId);

		// 			break;
		// 		}

		// 		default:
		// 			break;
		// 	}
		// });

		await this.cdp.rootSession.send("Target.setDiscoverTargets", { discover: true });
	}

	close() {
		if (this.browserProcess) {
			this.programClose = true;

			this.browserProcess.kill();
		} else {
			// TODO
		}
	}

	async openPage(url = "") {
		this.programOpenPage++;

		await this.cdp.rootSession.send("Target.createTarget", { url });
	}

	async closePage(page) {
		this.programClosePage++;

		await this.cdp.rootSession.send("Target.closeTarget", { targetId: page.target.targetId });
	}

	findPage(predicate) {
		return Array.from(this.pages.values()).find(predicate);
	}

	processClosed() {
		if (!this.closed) {
			this.browserProcess = null;
			this.wsEndpoint = null;

			this.emit("closed", this.programClose ? "program" : "user");
		}

		this.closed = true;
	}

	// OPTIONS

	get optionEnableRuntime() {
		return app.libs._.get(this.options, "enableRuntime", true);
	}

	get optionHandleAuthRequests() {
		return app.libs._.get(this.options, "handleAuthRequests", true);
	}
};
