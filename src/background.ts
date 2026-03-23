import {
	createEngineErrorResponse,
	createEngineRequest,
	ENGINE_MESSAGE_TYPES,
	ENGINE_OFFSCREEN_TARGET,
	type EngineMessageType,
	type EngineRequestPayload,
	type EngineResponse,
	type EngineResponsePayload,
	isBackgroundEngineRequest,
} from "./engine/protocol";

const OFFSCREEN_DOCUMENT_PATH = "offscreen/index.html";

let creatingOffscreenDocument: Promise<void> | null = null;

const hasOffscreenDocument = async () => {
	const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
	const contexts = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [offscreenUrl],
	});

	return contexts.length > 0;
};

const ensureOffscreenDocument = async () => {
	if (await hasOffscreenDocument()) return;

	if (creatingOffscreenDocument) {
		await creatingOffscreenDocument;
		return;
	}

	creatingOffscreenDocument = chrome.offscreen
		.createDocument({
			url: OFFSCREEN_DOCUMENT_PATH,
			reasons: ["WORKERS"],
			justification:
				"Run the Stockfish web worker in a hidden extension document.",
		})
		.finally(() => {
			creatingOffscreenDocument = null;
		});

	await creatingOffscreenDocument;
};

const forwardMessageToOffscreen = async <TType extends EngineMessageType>(
	type: TType,
	payload: EngineRequestPayload<TType>,
) => {
	await ensureOffscreenDocument();

	return chrome.runtime.sendMessage(
		createEngineRequest(ENGINE_OFFSCREEN_TARGET, type, payload),
	) as Promise<EngineResponse<EngineResponsePayload<TType>>>;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!isBackgroundEngineRequest(message)) return false;

	void (async () => {
		try {
			switch (message.type) {
				case ENGINE_MESSAGE_TYPES.INIT:
				case ENGINE_MESSAGE_TYPES.GET_STATUS:
				case ENGINE_MESSAGE_TYPES.STOP_ANALYSIS:
				case ENGINE_MESSAGE_TYPES.RESET:
				case ENGINE_MESSAGE_TYPES.ANALYZE_POSITION: {
					sendResponse(
						await forwardMessageToOffscreen(message.type, message.payload),
					);
					return;
				}
				default: {
					sendResponse(
						createEngineErrorResponse(
							"ENGINE_PROTOCOL_ERROR",
							"Unsupported engine message type.",
						),
					);
				}
			}
		} catch (error) {
			sendResponse(
				createEngineErrorResponse(
					"ENGINE_PROTOCOL_ERROR",
					error instanceof Error
						? error.message
						: "Unexpected background error.",
				),
			);
		}
	})();

	return true;
});
