import {
	type AnalyzePositionInput,
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
import {
	type ExtensionSettings,
	getDefaultExtensionSettings,
	getExtensionSettings,
	normalizeExtensionSettings,
	SETTINGS_STORAGE_KEY,
} from "./settings";

const OFFSCREEN_DOCUMENT_PATH = "offscreen/index.html";

let creatingOffscreenDocument: Promise<void> | null = null;
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

	if (typeof input.moveTimeMs === "number" && input.moveTimeMs > 0) {
		analyzeInput.moveTimeMs = input.moveTimeMs;
		return analyzeInput;
	}

	if (typeof input.depth === "number" && input.depth > 0) {
		analyzeInput.depth = input.depth;
		return analyzeInput;
	}

	if (settings.analysisMode === "moveTime") {
		analyzeInput.moveTimeMs = settings.moveTimeMs;
	} else {
		analyzeInput.depth = settings.depth;
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
		"Failed to preload extension settings in background service worker.",
		error,
	);
});

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
				case ENGINE_MESSAGE_TYPES.RESET: {
					sendResponse(
						await forwardMessageToOffscreen(message.type, message.payload),
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

					sendResponse(
						await forwardMessageToOffscreen(
							message.type,
							buildAnalyzeInputFromSettings(message.payload, currentSettings),
						),
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
