import {
	type AnalysisResult,
	type AnalyzePositionInput,
	createEngineRequest,
	ENGINE_BACKGROUND_TARGET,
	ENGINE_MESSAGE_TYPES,
	EngineClientError,
	type EngineMessageType,
	type EngineRequestPayload,
	type EngineResponse,
	type EngineResponsePayload,
	type EngineStatus,
} from "./protocol";

const sendEngineRequest = async <TType extends EngineMessageType>(
	type: TType,
	payload: EngineRequestPayload<TType>,
): Promise<EngineResponsePayload<TType>> => {
	const response = (await chrome.runtime.sendMessage(
		createEngineRequest(ENGINE_BACKGROUND_TARGET, type, payload),
	)) as EngineResponse<EngineResponsePayload<TType>> | undefined;

	if (!response) {
		throw new EngineClientError(
			"ENGINE_PROTOCOL_ERROR",
			"Engine service did not respond.",
		);
	}

	if (!response.ok) {
		throw new EngineClientError(response.error.code, response.error.message);
	}

	return response.data;
};

export const stockfishEngineClient = {
	init: async (): Promise<EngineStatus> => {
		const response = await sendEngineRequest(
			ENGINE_MESSAGE_TYPES.INIT,
			undefined,
		);
		return response.status;
	},
	getStatus: async (): Promise<EngineStatus> => {
		const response = await sendEngineRequest(
			ENGINE_MESSAGE_TYPES.GET_STATUS,
			undefined,
		);
		return response.status;
	},
	analyzePosition: async (
		input: AnalyzePositionInput,
	): Promise<AnalysisResult> => {
		return sendEngineRequest(ENGINE_MESSAGE_TYPES.ANALYZE_POSITION, input);
	},
	stopAnalysis: async (): Promise<EngineStatus> => {
		const response = await sendEngineRequest(
			ENGINE_MESSAGE_TYPES.STOP_ANALYSIS,
			undefined,
		);
		return response.status;
	},
	resetEngine: async (): Promise<EngineStatus> => {
		const response = await sendEngineRequest(
			ENGINE_MESSAGE_TYPES.RESET,
			undefined,
		);
		return response.status;
	},
};

export const initStockfishEngine = stockfishEngineClient.init;
export const getStockfishEngineStatus = stockfishEngineClient.getStatus;
export const analyzePosition = stockfishEngineClient.analyzePosition;
export const stopStockfishAnalysis = stockfishEngineClient.stopAnalysis;
export const resetStockfishEngine = stockfishEngineClient.resetEngine;
