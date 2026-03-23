import {
	createEngineErrorResponse,
	createEngineSuccessResponse,
	ENGINE_MESSAGE_TYPES,
	isOffscreenEngineRequest,
} from "../engine/protocol";
import { EngineServiceError, stockfishEngineService } from "../engine/service";

const createErrorResponse = (error: unknown) => {
	if (error instanceof EngineServiceError) {
		return createEngineErrorResponse(error.code, error.message);
	}

	if (error instanceof Error) {
		return createEngineErrorResponse("ENGINE_PROTOCOL_ERROR", error.message);
	}

	return createEngineErrorResponse(
		"ENGINE_PROTOCOL_ERROR",
		"Unexpected engine error.",
	);
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!isOffscreenEngineRequest(message)) return false;

	void (async () => {
		try {
			switch (message.type) {
				case ENGINE_MESSAGE_TYPES.INIT: {
					await stockfishEngineService.init();
					sendResponse(
						createEngineSuccessResponse({
							status: stockfishEngineService.getStatus(),
						}),
					);
					return;
				}
				case ENGINE_MESSAGE_TYPES.GET_STATUS: {
					sendResponse(
						createEngineSuccessResponse({
							status: stockfishEngineService.getStatus(),
						}),
					);
					return;
				}
				case ENGINE_MESSAGE_TYPES.ANALYZE_POSITION: {
					const result = await stockfishEngineService.analyzePosition(
						message.payload,
					);
					sendResponse(createEngineSuccessResponse(result));
					return;
				}
				case ENGINE_MESSAGE_TYPES.STOP_ANALYSIS: {
					await stockfishEngineService.stopAnalysis();
					sendResponse(
						createEngineSuccessResponse({
							status: stockfishEngineService.getStatus(),
						}),
					);
					return;
				}
				case ENGINE_MESSAGE_TYPES.RESET: {
					await stockfishEngineService.reset();
					sendResponse(
						createEngineSuccessResponse({
							status: stockfishEngineService.getStatus(),
						}),
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
			sendResponse(createErrorResponse(error));
		}
	})();

	return true;
});
