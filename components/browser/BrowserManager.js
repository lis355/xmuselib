const EventEmitter = require("events");

const sider = require("@lis355/sider");

module.exports = class BrowserManager extends ndapp.ApplicationComponent {
	async initialize() {
		await super.initialize();

		this.events = new EventEmitter();
	}

	async openBrowser() {
		const args = new sider.CLIArguments();

		args.parseArrayArguments([
			"--start-maximized",
			"--restore-last-session"
		]);

		args.set("--user-data-dir", app.getUserDataPath("browserData"));

		args.set("--auto-open-devtools-for-tabs");

		this.browser = new sider.Browser();

		let executablePath;
		switch (process.platform) {
			case "linux":
				executablePath = "/opt/google/chrome/chrome";
				break;
			case "win32":
				executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
				break;
			default:
				throw new Error(`Unsupported platform: ${process.platform}`);
		}

		await this.browser.launch({
			executablePath,
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
