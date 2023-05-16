const EventEmitter = require("events");

let invalidInterceptionIdErrorShowed = false;
let sessionWithGivenIdNotFoundErrorShowed = false;

module.exports = class Network extends EventEmitter {
	constructor(page) {
		super();

		this.page = page;

		// нельзя просто делать emit("response") потому что обработчики, в которых может быть запрошено тело запроса, будут асинхроннымы, и тогда все порушится
		this.requestHandler = null;
		this.responseHandler = null;

		this.requestFilter = null;
	}

	get cdp() {
		return this.page.cdp;
	}

	async initialize() {
		// Пока что это не нужно, все обрабатывается в домэйне fetch
		// await this.cdp.send("Network.enable");

		await this.cdp.send("Fetch.enable", {
			handleAuthRequests: this.page.browser.optionHandleAuthRequests,
			patterns: [
				{ requestStage: "Request" },
				{ requestStage: "Response" }
			]
		});

		this.cdp.on("Fetch.requestPaused", async params => {
			// Fetch.requestPaused вызывается на оба requestStage, Request и Response
			// по идее, есть возможность менять полученный ответ (Fetch.fulfillRequest) или реджектить его (Fetch.failRequest)
			// пока что это не нужно

			// (this.debugPausedRequests = this.debugPausedRequests || {})[params.requestId] = params;

			const requestStageResponse = "responseErrorReason" in params ||
				"responseStatusCode" in params ||
				"responseStatusText" in params ||
				"responseHeaders" in params;

			if (requestStageResponse) {
				if (this.responseHandler) {
					await this.responseHandler(params);
				}

				// NOTE DIRTY
				// https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-continueResponse
				// По идее, тут надо юзать Fetch.continueResponse т.к. это requestStage Response
				// почему то в инкогнитоне все ламается из-за этого, (вообще помечено как EXPERIMENTAL)
				// так что пока что с оставим Fetch.continueRequest

				this.cdp.send("Fetch.continueRequest", { requestId: params.requestId })
					.catch(this.handleContinueRequestOrResponseError.bind(this));
			} else {
				if (this.requestHandler) {
					await this.requestHandler(params);
				}

				const passed = this.requestFilter ? this.requestFilter(params.request) : true;
				if (passed) {
					this.cdp.send("Fetch.continueRequest", { requestId: params.requestId })
						.catch(this.handleContinueRequestOrResponseError.bind(this));
				} else {
					this.cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" })
						.catch(this.handleContinueRequestOrResponseError.bind(this));
				}
			}

			// if (params.responseErrorReason) {
			// 	this.emit("response", params);

			// 	if (params.responseErrorReason !== "Failed") {
			// 		this.cdp.send("Fetch.continueRequest", { requestId: params.requestId });
			// 	}
			// } else if (params.responseStatusCode ||
			// 	params.responseStatusText) {
			// 	this.emit("response", params);

			// 	this.cdp.send("Fetch.continueRequest", { requestId: params.requestId });
			// } else {
			// 	const request = params.request;

			// 	this.emit("request", request);

			// 	let passed = this.requestFilter ? this.requestFilter(request) : true;
			// 	if (passed) {
			// 		this.cdp.send("Fetch.continueRequest", { requestId: params.requestId });
			// 	} else {
			// 		this.cdp.send("Fetch.failRequest", { requestId: params.requestId, errorReason: "Failed" });
			// 	}
			// }
		});

		this.cdp.on("Fetch.authRequired", params => {
			this.cdp.send("Fetch.continueWithAuth", {
				requestId: params.requestId,
				authChallengeResponse: {
					response: "ProvideCredentials",
					...this.credentials
				}
			});
		});
	}

	async getResponseBody(requestId) {
		const bodyResult = await this.cdp.send("Fetch.getResponseBody", { requestId });

		return Buffer.from(bodyResult.body, bodyResult.base64Encoded && "base64");
	}

	async getResponseJson(response) {
		const body = await this.getResponseBody(response.requestId);

		return JSON.parse(body.toString() || "{}");
	}

	handleContinueRequestOrResponseError(error) {
		if (error.message.includes("Invalid InterceptionId")) {
			// оч непонятная ошибка, инфа по ней не гуглится
			// есть теория, что она появляется, когда фрейм рефрешится, или удаляется, или что-то такое
			// когда страница перезагружается, стабильно как будто возникает эта ошибка, т.е. получается суть такая,
			// поскольку мы перехватыает реквесты и респонсы, и обрабатываем их асинхронно, в это время страница (фрейм) может рефрешнуться и
			// тогда requestId станет уже неактуальным, вот и появляется ошибка
			// пока что будем игнорировать

			if (!invalidInterceptionIdErrorShowed) {
				invalidInterceptionIdErrorShowed = true;

				console.log(`Invalid InterceptionId error on ${error.data.command.params.requestId}`);
				// console.log(this.debugPausedRequests[error.data.command.params.requestId]);
			}
		} else if (error.message.includes("Session with given id not found")) {
			// обычно происходит, когда закрывается ВНЕЗАПНО вкладка

			if (!sessionWithGivenIdNotFoundErrorShowed) {
				sessionWithGivenIdNotFoundErrorShowed = true;

				console.log(`Session with given id not found error on ${error.data.command.params.requestId}`);
			}
		} else {
			throw error;
		}
	}
};
