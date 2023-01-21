const EventEmitter = require("events");

const CLIArguments = require("../tools/sider/CLIArguments");
const sider = require("../tools/sider");

module.exports = class BrowserManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.events = new EventEmitter();

		const args = new CLIArguments();

		args.parseArrayArguments([
			"--start-maximized",
			"--restore-last-session"
		]);

		args.set("--user-data-dir", app.getUserDataPath("browserData"));

		args.set("--auto-open-devtools-for-tabs");

		this.browser = new sider.Browser({});

		await this.browser.launch({
			executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
			args
		});

		this.browser.on("closed", () => {
			app.quit();
		});

		await this.browser.initialize();

		this.page = await new Promise(resolve => {
			this.browser.once("pageAdded", page => {
				page.network.responseHandler = async params => {
					try {
						if (params.responseErrorReason) {
							await this.processResponseFailed(params);
						} else {
							await this.processResponse(params);
						}
					} catch (error) {
						app.log.error(error.stack);
					}
				};

				return resolve(page);
			});
		});
	}

	async processResponseFailed(params) {
		this.events.emit("responseFailed", params);
	}

	async processResponse(params) {
		this.events.emit("response", params);
	}
};
