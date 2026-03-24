import { clamp, toInteger } from "./utils/math";
import { isRecord } from "./utils/object";
import { storage } from "./utils/storage";

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
			toInteger(value.depth, defaults.depth),
			SETTINGS_LIMITS.depth.min,
			SETTINGS_LIMITS.depth.max,
		),
		moveTimeMs: clamp(
			toInteger(value.moveTimeMs, defaults.moveTimeMs),
			SETTINGS_LIMITS.moveTimeMs.min,
			SETTINGS_LIMITS.moveTimeMs.max,
		),
		multiPv: clamp(
			toInteger(value.multiPv, defaults.multiPv),
			SETTINGS_LIMITS.multiPv.min,
			SETTINGS_LIMITS.multiPv.max,
		),
	};
};

export const getExtensionSettings = async (): Promise<ExtensionSettings> => {
	const storedSettings = await storage.get(SETTINGS_STORAGE_KEY);
	return normalizeExtensionSettings(storedSettings);
};

export const saveExtensionSettings = async (
	settings: ExtensionSettings,
): Promise<ExtensionSettings> => {
	const normalizedSettings = normalizeExtensionSettings(settings);

	await storage.set(SETTINGS_STORAGE_KEY, normalizedSettings);

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
