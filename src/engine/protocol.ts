export const ENGINE_MESSAGE_NAMESPACE = "stockfish-engine";
export const ENGINE_BACKGROUND_TARGET = "background";
export const ENGINE_OFFSCREEN_TARGET = "offscreen";

export const ENGINE_MESSAGE_TYPES = {
	INIT: "engine:init",
	GET_STATUS: "engine:getStatus",
	ANALYZE_POSITION: "engine:analyzePosition",
	STOP_ANALYSIS: "engine:stopAnalysis",
	RESET: "engine:reset",
} as const;

export type EngineMessageType =
	(typeof ENGINE_MESSAGE_TYPES)[keyof typeof ENGINE_MESSAGE_TYPES];

export type EngineStatus = "idle" | "loading" | "ready" | "analyzing" | "error";

export type EngineErrorCode =
	| "ENGINE_NOT_READY"
	| "ENGINE_LOAD_FAILED"
	| "ANALYSIS_ABORTED"
	| "INVALID_FEN"
	| "ENGINE_PROTOCOL_ERROR";

export interface AnalyzePositionInput {
	fen: string;
	depth?: number;
	moveTimeMs?: number;
	multiPv?: number;
}

export interface AnalysisMove {
	uci: string;
	depth: number;
	scoreCp: number | null;
	mateIn: number | null;
	pv: string[];
}

export interface AnalysisResult {
	fen: string;
	bestMove: AnalysisMove | null;
	moves: AnalysisMove[];
	depth: number;
	engine: "stockfish";
}

export interface EngineStatusPayload {
	status: EngineStatus;
}

export interface EngineRequestPayloadMap {
	[ENGINE_MESSAGE_TYPES.INIT]: undefined;
	[ENGINE_MESSAGE_TYPES.GET_STATUS]: undefined;
	[ENGINE_MESSAGE_TYPES.ANALYZE_POSITION]: AnalyzePositionInput;
	[ENGINE_MESSAGE_TYPES.STOP_ANALYSIS]: undefined;
	[ENGINE_MESSAGE_TYPES.RESET]: undefined;
}

export interface EngineResponsePayloadMap {
	[ENGINE_MESSAGE_TYPES.INIT]: EngineStatusPayload;
	[ENGINE_MESSAGE_TYPES.GET_STATUS]: EngineStatusPayload;
	[ENGINE_MESSAGE_TYPES.ANALYZE_POSITION]: AnalysisResult;
	[ENGINE_MESSAGE_TYPES.STOP_ANALYSIS]: EngineStatusPayload;
	[ENGINE_MESSAGE_TYPES.RESET]: EngineStatusPayload;
}

export type EngineRequestPayload<TType extends EngineMessageType> =
	EngineRequestPayloadMap[TType];

export type EngineResponsePayload<TType extends EngineMessageType> =
	EngineResponsePayloadMap[TType];

export type EngineRequest<TTarget extends string = string> = {
	[K in EngineMessageType]: {
		namespace: typeof ENGINE_MESSAGE_NAMESPACE;
		target: TTarget;
		type: K;
		payload: EngineRequestPayloadMap[K];
	};
}[EngineMessageType];

export interface EngineSuccessResponse<TData> {
	ok: true;
	data: TData;
}

export interface EngineErrorResponse {
	ok: false;
	error: {
		code: EngineErrorCode;
		message: string;
	};
}

export type EngineResponse<TData> =
	| EngineSuccessResponse<TData>
	| EngineErrorResponse;

export class EngineClientError extends Error {
	code: EngineErrorCode;

	constructor(code: EngineErrorCode, message: string) {
		super(message);
		this.name = "EngineClientError";
		this.code = code;
	}
}

export const createEngineRequest = <
	TTarget extends string,
	TType extends EngineMessageType,
>(
	target: TTarget,
	type: TType,
	payload: EngineRequestPayload<TType>,
): EngineRequest<TTarget> =>
	({
		namespace: ENGINE_MESSAGE_NAMESPACE,
		target,
		type,
		payload,
	}) as EngineRequest<TTarget>;

export const createEngineSuccessResponse = <TData>(
	data: TData,
): EngineSuccessResponse<TData> => ({
	ok: true,
	data,
});

export const createEngineErrorResponse = (
	code: EngineErrorCode,
	message: string,
): EngineErrorResponse => ({
	ok: false,
	error: {
		code,
		message,
	},
});

export const isEngineRequest = (value: unknown): value is EngineRequest => {
	if (!value || typeof value !== "object") return false;

	const message = value as Partial<EngineRequest>;

	return (
		message.namespace === ENGINE_MESSAGE_NAMESPACE &&
		typeof message.target === "string" &&
		typeof message.type === "string"
	);
};

export const isBackgroundEngineRequest = (
	value: unknown,
): value is EngineRequest<typeof ENGINE_BACKGROUND_TARGET> => {
	return isEngineRequest(value) && value.target === ENGINE_BACKGROUND_TARGET;
};

export const isOffscreenEngineRequest = (
	value: unknown,
): value is EngineRequest<typeof ENGINE_OFFSCREEN_TARGET> => {
	return isEngineRequest(value) && value.target === ENGINE_OFFSCREEN_TARGET;
};
