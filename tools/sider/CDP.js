const EventEmitter = require("events");

const ws = require("ws");

const SiderError = require("./Error");
const Target = require("./Target");

const CDP_LOG = false;

module.exports = class CDP extends EventEmitter {
	constructor(browser, endpoint) {
		super();

		this.browser = browser;
		this.endpoint = endpoint;

		// console.log(`WS ${this.endpoint}`);
	}

	async initialize() {
		this.ws = await new Promise((resolve, reject) => {
			const webSocket = new ws(this.endpoint, [], {
				followRedirects: true,
				perMessageDeflate: false
			});

			webSocket.once("open", () => resolve(webSocket));
			webSocket.once("error", reject);
		});

		this.ws.on("message", this.handleMessage.bind(this));

		this.ws.on("close", code => {
			this.emit("closed", code);
		});

		this.ws.on("error", () => {
			// TODO
		});

		this.callbacks = new Map();
		this.sessions = new Map();
		this.sessions.set(undefined, this.rootSession = new CDPRootSession(this));
	}

	async send({ method, sessionId, params }) {
		if (!method) throw new SiderError("No method", { sessionId, params });

		return new Promise((resolve, reject) => {
			const currentId = this.id = (this.id || 0) + 1;

			const command = { id: this.id, method, sessionId, params };
			if (CDP_LOG) console.log("SEND " + JSON.stringify(command, null, "\t"));

			this.ws.send(JSON.stringify(command));

			this.callbacks.set(currentId, { command, resolve, reject });
		});
	}

	handleMessage(message) {
		const object = JSON.parse(message);
		if (CDP_LOG) console.log("RECIEVE " + JSON.stringify(object, null, "\t"));

		const { error, id, sessionId, method, params } = object;
		if (id) {
			const callback = this.callbacks.get(id);
			if (!callback) throw new SiderError(`No callback to id ${id}`, id);

			this.callbacks.delete(object.id);

			if (error) {
				callback.reject(this.createError(error, callback.command));
			} else {
				callback.resolve(object.result);
			}
		} else if (error) {
			throw this.createError(error);
		} else if (method === "Target.attachedToTarget") {
			const sessionId = params.sessionId;
			const target = this.rootSession.targets.get(params.targetInfo.targetId);
			const session = new CDPSession(this, sessionId, target);
			target.handleAttached(session);
			this.sessions.set(sessionId, session);

			// TODO
			// this._sessions.set(sessionId, session);
			// this.emit("sessionattached", session);
			// const parentSession = this._sessions.get(object.sessionId);
			// if (parentSession) {
			// 	parentSession.emit("sessionattached", session);
			// }
		} else if (method === "Target.detachedFromTarget") {
			const sessionId = params.sessionId;
			const session = this.sessions.get(sessionId);
			if (!session) throw new SiderError(`No session to id ${session}`, session);

			session.target.handleDetached();
			this.sessions.delete(sessionId);

			// TODO
			// const parentSession = this._sessions.get(sessionId);
			// if (parentSession) {
			// 	parentSession.emit("sessiondetached", session);
			// }
		} else {
			const session = this.sessions.get(sessionId);
			if (!session) throw new SiderError(`No session to id ${session}`, session);

			session.handleMessage(object);
		}
	}

	createError(errorData, command) {
		return new SiderError(errorData.message, { ...errorData, command });
	}
};

class CDPSession extends EventEmitter {
	constructor(cdp, sessionId, target) {
		super();

		this.cdp = cdp;
		this.sessionId = sessionId;
		this.target = target;
	}

	async send(method, params) {
		return this.cdp.send({ method, sessionId: this.sessionId, params });
	}

	handleMessage(message) {
		this.emit(message.method, message.params);
	}
}

class CDPRootSession extends CDPSession {
	constructor(cdp) {
		super(cdp);

		this.targets = new Map();

		this.on("Target.targetCreated", params => {
			const targetInfo = params.targetInfo;
			const target = new Target(this, targetInfo);
			this.targets.set(targetInfo.targetId, target);

			this.emit("targetCreated", target);
		});

		// this.on("Target.targetInfoChanged", params => {
		// 	const targetInfo = params.targetInfo;
		// 	const target = this.targets.get(targetInfo.targetId);
		// 	if (target) {
		// 		target.handleInfoChanged(targetInfo);
		// 	}
		// });

		this.on("Target.targetDestroyed", params => {
			const target = this.targets.get(params.targetId);
			this.targets.delete(target.targetId);

			this.emit("targetDestroyed", target);
		});
	}
};
