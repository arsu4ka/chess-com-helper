export type AnalysisMode = "depth" | "moveTime";

export interface ExtensionSettings {
	enabled: boolean;
	analysisMode: AnalysisMode;
	depth: number;
	moveTimeMs: number;
	multiPv: number;
}

export const SETTINGS_STORAGE_KEY = "extensionSettings";

export const SETTINGS_LIMITS = {
	depth: {
		min: 8,
		max: 24,
		step: 1,
	},
	moveTimeMs: {
		min: 200,
		max: 2500,
		step: 100,
	},
	multiPv: {
		min: 1,
		max: 5,
		step: 1,
	},
} as const;

const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
	enabled: true,
	analysisMode: "depth",
	depth: 15,
	moveTimeMs: 1000,
	multiPv: 3,
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null;
};

const clamp = (value: number, min: number, max: number) => {
	return Math.min(Math.max(value, min), max);
};

const getNumber = (value: unknown, fallback: number) => {
	if (typeof value !== "number" || Number.isNaN(value)) return fallback;
	return Math.trunc(value);
};

export const getDefaultExtensionSettings = (): ExtensionSettings => {
	return { ...DEFAULT_EXTENSION_SETTINGS };
};

export const normalizeExtensionSettings = (
	value: unknown,
): ExtensionSettings => {
	const defaults = getDefaultExtensionSettings();

	if (!isRecord(value)) return defaults;

	return {
		enabled:
			typeof value.enabled === "boolean" ? value.enabled : defaults.enabled,
		analysisMode:
			value.analysisMode === "moveTime" ? "moveTime" : defaults.analysisMode,
		depth: clamp(
			getNumber(value.depth, defaults.depth),
			SETTINGS_LIMITS.depth.min,
			SETTINGS_LIMITS.depth.max,
		),
		moveTimeMs: clamp(
			getNumber(value.moveTimeMs, defaults.moveTimeMs),
			SETTINGS_LIMITS.moveTimeMs.min,
			SETTINGS_LIMITS.moveTimeMs.max,
		),
		multiPv: clamp(
			getNumber(value.multiPv, defaults.multiPv),
			SETTINGS_LIMITS.multiPv.min,
			SETTINGS_LIMITS.multiPv.max,
		),
	};
};

export const getExtensionSettings = async (): Promise<ExtensionSettings> => {
	const result = await chrome.storage.sync.get(SETTINGS_STORAGE_KEY);
	return normalizeExtensionSettings(result[SETTINGS_STORAGE_KEY]);
};

export const saveExtensionSettings = async (
	settings: ExtensionSettings,
): Promise<ExtensionSettings> => {
	const normalizedSettings = normalizeExtensionSettings(settings);

	await chrome.storage.sync.set({
		[SETTINGS_STORAGE_KEY]: normalizedSettings,
	});

	return normalizedSettings;
};

export const updateExtensionSettings = async (
	patch: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> => {
	const currentSettings = await getExtensionSettings();
	const nextSettings = normalizeExtensionSettings({
		...currentSettings,
		...patch,
	});

	return saveExtensionSettings(nextSettings);
};
