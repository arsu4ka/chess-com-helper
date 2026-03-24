import { startTransition, useEffect, useRef, useState } from "react";

import { getStockfishEngineStatus } from "../engine/client";
import type { EngineStatus } from "../engine/protocol";
import {
	type AnalysisMode,
	type ExtensionSettings,
	getDefaultExtensionSettings,
	getExtensionSettings,
	SETTINGS_LIMITS,
	saveExtensionSettings,
} from "../settings";

const SAVE_DEBOUNCE_MS = 220;
const SAVED_BADGE_DURATION_MS = 1400;
const POPUP_LOGO_URL = chrome.runtime.getURL("icons/icon.png");

type SaveState = "idle" | "saving" | "saved" | "error";

const engineStatusMeta: Record<
	EngineStatus,
	{ emoji: string; label: string; tone: string }
> = {
	idle: {
		emoji: "💤",
		label: "Idle",
		tone: "bg-slate-900/8 text-slate-600",
	},
	loading: {
		emoji: "🧩",
		label: "Loading",
		tone: "bg-amber-200/80 text-amber-950",
	},
	ready: {
		emoji: "✅",
		label: "Ready",
		tone: "bg-emerald-200/80 text-emerald-950",
	},
	analyzing: {
		emoji: "🧠",
		label: "Analyzing",
		tone: "bg-sky-200/80 text-sky-950",
	},
	error: {
		emoji: "⚠️",
		label: "Error",
		tone: "bg-rose-200/85 text-rose-950",
	},
};

const saveStateMeta: Record<
	SaveState,
	{ emoji: string; label: string; tone: string }
> = {
	idle: {
		emoji: "☁️",
		label: "Auto",
		tone: "bg-white/75 text-slate-500",
	},
	saving: {
		emoji: "💾",
		label: "Saving",
		tone: "bg-amber-200/80 text-amber-950",
	},
	saved: {
		emoji: "✨",
		label: "Saved",
		tone: "bg-emerald-200/80 text-emerald-950",
	},
	error: {
		emoji: "⚠️",
		label: "Failed",
		tone: "bg-rose-200/85 text-rose-950",
	},
};

const formatMoveTime = (moveTimeMs: number) =>
	`${(moveTimeMs / 1000).toFixed(1)}s`;

const getProfileSummary = (settings: ExtensionSettings) => {
	const modeValue =
		settings.analysisMode === "depth"
			? `D${settings.depth}`
			: formatMoveTime(settings.moveTimeMs);

	return `${modeValue} • ${settings.multiPv} line${settings.multiPv > 1 ? "s" : ""}`;
};

const PopupSkeleton = () => {
	return (
		<div className="px-4 py-4">
			<div className="animate-pulse rounded-[30px] border border-white/60 bg-white/74 p-4 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
				<div className="flex items-center justify-between">
					<div>
						<div className="h-6 w-28 rounded-full bg-slate-200/80" />
						<div className="mt-2 h-3 w-20 rounded-full bg-slate-200/70" />
					</div>
					<div className="h-12 w-22 rounded-full bg-slate-200/80" />
				</div>
				<div className="mt-4 flex gap-2">
					<div className="h-7 w-24 rounded-full bg-slate-200/70" />
					<div className="h-7 w-24 rounded-full bg-slate-200/70" />
					<div className="h-7 w-20 rounded-full bg-slate-200/70" />
				</div>
				<div className="mt-4 h-14 rounded-3xl bg-slate-200/60" />
				<div className="mt-3 grid grid-cols-2 gap-3">
					<div className="h-34 rounded-3xl bg-slate-200/60" />
					<div className="h-34 rounded-3xl bg-slate-200/60" />
				</div>
			</div>
		</div>
	);
};

interface ModeButtonProps {
	label: string;
	emoji: string;
	isSelected: boolean;
	onClick: () => void;
}

const ModeButton = ({ label, emoji, isSelected, onClick }: ModeButtonProps) => {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
				isSelected
					? "bg-slate-950 text-white shadow-[0_12px_20px_rgba(15,23,42,0.16)]"
					: "bg-white/70 text-slate-600 hover:bg-white"
			}`}
		>
			<span>{emoji}</span>
			<span>{label}</span>
		</button>
	);
};

interface SliderPanelProps {
	emoji: string;
	label: string;
	valueLabel: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
}

const SliderPanel = ({
	emoji,
	label,
	valueLabel,
	min,
	max,
	step,
	value,
	onChange,
}: SliderPanelProps) => {
	return (
		<section className="rounded-3xl border border-[rgba(15,23,42,0.08)] bg-white/82 p-4 shadow-[0_16px_30px_rgba(15,23,42,0.08)] backdrop-blur-md">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="text-base">{emoji}</span>
					<p className="text-sm font-semibold text-slate-800">{label}</p>
				</div>
				<div className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">
					{valueLabel}
				</div>
			</div>
			<div className="mt-4">
				<input
					className="control-slider"
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onChange={(event) => {
						onChange(Number.parseInt(event.target.value, 10));
					}}
				/>
				<div className="mt-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
					<span>{min}</span>
					<span>{max}</span>
				</div>
			</div>
		</section>
	);
};

interface StatusChipProps {
	emoji: string;
	label: string;
	tone: string;
}

const StatusChip = ({ emoji, label, tone }: StatusChipProps) => {
	return (
		<div
			className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] ${tone}`}
		>
			<span>{emoji}</span>
			<span>{label}</span>
		</div>
	);
};

export function App() {
	const [settings, setSettings] = useState<ExtensionSettings>(
		getDefaultExtensionSettings,
	);
	const [engineStatus, setEngineStatus] = useState<EngineStatus>("idle");
	const [isLoading, setIsLoading] = useState(true);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const hasHydratedSettings = useRef(false);
	const saveTimerRef = useRef<number | null>(null);
	const saveStateResetTimerRef = useRef<number | null>(null);

	useEffect(() => {
		let isActive = true;

		void (async () => {
			try {
				const [storedSettings, status] = await Promise.all([
					getExtensionSettings(),
					getStockfishEngineStatus().catch(() => "error" as const),
				]);

				if (!isActive) return;

				startTransition(() => {
					setSettings(storedSettings);
					setEngineStatus(status);
					setErrorMessage(null);
					setIsLoading(false);
				});
			} catch (_error) {
				if (!isActive) return;

				startTransition(() => {
					setSettings(getDefaultExtensionSettings());
					setEngineStatus("error");
					setErrorMessage("Could not load saved settings.");
					setIsLoading(false);
				});
			}
		})();

		return () => {
			isActive = false;

			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
			}

			if (saveStateResetTimerRef.current) {
				window.clearTimeout(saveStateResetTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (isLoading) return;

		if (!hasHydratedSettings.current) {
			hasHydratedSettings.current = true;
			return;
		}

		if (saveTimerRef.current) {
			window.clearTimeout(saveTimerRef.current);
		}

		setSaveState("saving");

		saveTimerRef.current = window.setTimeout(() => {
			void (async () => {
				try {
					await saveExtensionSettings(settings);
					setSaveState("saved");
					setErrorMessage(null);

					if (saveStateResetTimerRef.current) {
						window.clearTimeout(saveStateResetTimerRef.current);
					}

					saveStateResetTimerRef.current = window.setTimeout(() => {
						setSaveState("idle");
					}, SAVED_BADGE_DURATION_MS);
				} catch (_error) {
					setSaveState("error");
					setErrorMessage("Could not save changes.");
				}
			})();
		}, SAVE_DEBOUNCE_MS);

		return () => {
			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
			}
		};
	}, [isLoading, settings]);

	const currentEngineMeta = engineStatusMeta[engineStatus];
	const currentSaveMeta = saveStateMeta[saveState];

	const setAnalysisMode = (mode: AnalysisMode) => {
		setSettings((currentSettings) => ({
			...currentSettings,
			analysisMode: mode,
		}));
	};

	if (isLoading) {
		return <PopupSkeleton />;
	}

	return (
		<div className="px-4 py-4 text-slate-950">
			<div className="overflow-hidden rounded-[30px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,248,239,0.8))] p-4 shadow-[0_20px_42px_rgba(15,23,42,0.1)] backdrop-blur-xl">
				<header className="flex items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2">
							<div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-[0_12px_18px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/8">
								<img
									src={POPUP_LOGO_URL}
									alt="Chess.com Helper logo"
									className="h-full w-full object-cover"
								/>
							</div>
							<div>
								<h1 className="font-(family-name:--font-display) text-[24px] font-semibold leading-none tracking-[-0.05em] text-slate-950">
									<span className="text-emerald-700">Chess.com</span> Helper
								</h1>
								<a
									href="https://t.me/arsu4ka"
									target="_blank"
									rel="noreferrer"
									className="mt-1 inline-flex text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:text-slate-950"
								>
									BY @arsu4ka
								</a>
							</div>
						</div>
					</div>

					<button
						type="button"
						role="switch"
						aria-checked={settings.enabled}
						onClick={() => {
							setSettings((currentSettings) => ({
								...currentSettings,
								enabled: !currentSettings.enabled,
							}));
						}}
						className={`relative h-12 w-22 rounded-full border transition ${
							settings.enabled
								? "border-emerald-300/80 bg-emerald-200/80"
								: "border-slate-300/80 bg-slate-200/85"
						}`}
					>
						<span
							className={`absolute top-1 flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm shadow-[0_10px_18px_rgba(15,23,42,0.16)] transition ${
								settings.enabled ? "left-[calc(100%-2.75rem)]" : "left-1"
							}`}
						>
							{settings.enabled ? "🔥" : "⏸️"}
						</span>
					</button>
				</header>

				<div className="mt-4 flex flex-wrap gap-2">
					<StatusChip
						emoji={settings.enabled ? "🟢" : "⚫"}
						label={settings.enabled ? "Active" : "Paused"}
						tone={
							settings.enabled
								? "bg-emerald-200/80 text-emerald-950"
								: "bg-slate-900/8 text-slate-600"
						}
					/>
					<StatusChip
						emoji={currentEngineMeta.emoji}
						label={currentEngineMeta.label}
						tone={currentEngineMeta.tone}
					/>
					<StatusChip
						emoji={currentSaveMeta.emoji}
						label={currentSaveMeta.label}
						tone={currentSaveMeta.tone}
					/>
				</div>

				{errorMessage ? (
					<div className="mt-3 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-xs font-medium text-rose-900">
						⚠️ {errorMessage}
					</div>
				) : null}

				<section className="mt-4 rounded-3xl border border-[rgba(15,23,42,0.08)] bg-white/78 p-3 shadow-[0_14px_26px_rgba(15,23,42,0.06)]">
					<div className="grid grid-cols-2 gap-2">
						<ModeButton
							label="Depth"
							emoji="🎯"
							isSelected={settings.analysisMode === "depth"}
							onClick={() => {
								setAnalysisMode("depth");
							}}
						/>
						<ModeButton
							label="Time"
							emoji="⏱️"
							isSelected={settings.analysisMode === "moveTime"}
							onClick={() => {
								setAnalysisMode("moveTime");
							}}
						/>
					</div>
				</section>

				<div className="mt-3 grid grid-cols-2 gap-3">
					{settings.analysisMode === "depth" ? (
						<SliderPanel
							emoji="🎚️"
							label="Depth"
							valueLabel={`D${settings.depth}`}
							min={SETTINGS_LIMITS.depth.min}
							max={SETTINGS_LIMITS.depth.max}
							step={SETTINGS_LIMITS.depth.step}
							value={settings.depth}
							onChange={(value) => {
								setSettings((currentSettings) => ({
									...currentSettings,
									depth: value,
								}));
							}}
						/>
					) : (
						<SliderPanel
							emoji="⚡"
							label="Move Time"
							valueLabel={formatMoveTime(settings.moveTimeMs)}
							min={SETTINGS_LIMITS.moveTimeMs.min}
							max={SETTINGS_LIMITS.moveTimeMs.max}
							step={SETTINGS_LIMITS.moveTimeMs.step}
							value={settings.moveTimeMs}
							onChange={(value) => {
								setSettings((currentSettings) => ({
									...currentSettings,
									moveTimeMs: value,
								}));
							}}
						/>
					)}

					<SliderPanel
						emoji="🌈"
						label="MultiPV"
						valueLabel={`${settings.multiPv}`}
						min={SETTINGS_LIMITS.multiPv.min}
						max={SETTINGS_LIMITS.multiPv.max}
						step={SETTINGS_LIMITS.multiPv.step}
						value={settings.multiPv}
						onChange={(value) => {
							setSettings((currentSettings) => ({
								...currentSettings,
								multiPv: value,
							}));
						}}
					/>
				</div>

				<footer className="mt-3 flex items-center justify-between rounded-[22px] bg-slate-950 px-4 py-3 text-sm text-white shadow-[0_14px_24px_rgba(15,23,42,0.16)]">
					<span className="font-medium">🧠 {getProfileSummary(settings)}</span>
					<span className="text-white/72">
						{settings.enabled ? "Watching" : "Sleeping"}
					</span>
				</footer>
			</div>
		</div>
	);
}
