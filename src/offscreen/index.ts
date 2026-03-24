import {
	type AnalyzePositionInput,
	createEngineErrorResponse,
	createEngineSuccessResponse,
	ENGINE_MESSAGE_TYPES,
	isOffscreenEngineRequest,
} from "../engine/protocol";
import { EngineServiceError, stockfishEngineService } from "../engine/service";
import {
	type ExtensionSettings,
	getDefaultExtensionSettings,
	getExtensionSettings,
	normalizeExtensionSettings,
	SETTINGS_STORAGE_KEY,
} from "../settings";

let currentSettings = getDefaultExtensionSettings();
let settingsReadyPromise: Promise<void> | null = null;

const loadSettingsIntoCache = async () => {
	currentSettings = await getExtensionSettings();
};

const ensureSettingsReady = async () => {
	if (settingsReadyPromise) {
		await settingsReadyPromise;
		return;
	}

	settingsReadyPromise = loadSettingsIntoCache().finally(() => {
		settingsReadyPromise = null;
	});

	await settingsReadyPromise;
};

const buildAnalyzeInputFromSettings = (
	input: AnalyzePositionInput,
	settings: ExtensionSettings,
): AnalyzePositionInput => {
	const analyzeInput: AnalyzePositionInput = {
		fen: input.fen,
		multiPv: input.multiPv ?? settings.multiPv,
	};

	if (settings.analysisMode === "depth") {
		analyzeInput.depth = input.depth ?? settings.depth;
	} else {
		analyzeInput.moveTimeMs = input.moveTimeMs ?? settings.moveTimeMs;
	}

	return analyzeInput;
};

chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName !== "sync") return;

	const settingsChange = changes[SETTINGS_STORAGE_KEY];
	if (!settingsChange) return;

	currentSettings = normalizeExtensionSettings(settingsChange.newValue);
});

void ensureSettingsReady().catch((error) => {
	console.error(
		"Failed to preload extension settings in offscreen document.",
		error,
	);
});

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
					await ensureSettingsReady();

					if (!currentSettings.enabled) {
						sendResponse(
							createEngineErrorResponse(
								"EXTENSION_DISABLED",
								"Extension analysis is currently disabled in popup settings.",
							),
						);
						return;
					}

					const result = await stockfishEngineService.analyzePosition(
						buildAnalyzeInputFromSettings(message.payload, currentSettings),
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
