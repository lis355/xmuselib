const EventEmitter = require("events");

module.exports = class Target extends EventEmitter {
	constructor(cdpRootSession, targetInfo) {
		super();

		this.targetInfo = targetInfo;
		this.cdpRootSession = cdpRootSession;
		this.cdpSession = null;
	}

	get targetId() {
		return this.targetInfo.targetId;
	}

	// handleInfoChanged(targetInfo) {
	// 	// пока не понял почему, но перед закрытием страницы ее type меняется, и логика вся портится
	// 	// пока не будем обновлять targetInfo.type
	// 	app.libs._.unset(targetInfo, "type");

	// 	app.libs._.assign(this.targetInfo, targetInfo);
	// }

	handleAttached(cdpSession) {
		this.cdpSession = cdpSession;

		this.emit("attached", cdpSession);
	}

	handleDetached() {
		this.cdpSession = null;

		this.emit("detached");
	}
};
