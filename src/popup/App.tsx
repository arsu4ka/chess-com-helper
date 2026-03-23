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

type SaveState = "idle" | "saving" | "saved" | "error";

const engineStatusMeta: Record<
	EngineStatus,
	{ label: string; tone: string; description: string }
> = {
	idle: {
		label: "Idle",
		tone: "bg-slate-900/8 text-slate-600",
		description: "The engine is sleeping until analysis is requested.",
	},
	loading: {
		label: "Loading",
		tone: "bg-amber-200/70 text-amber-900",
		description: "Stockfish is warming up in the hidden document.",
	},
	ready: {
		label: "Ready",
		tone: "bg-emerald-200/70 text-emerald-900",
		description: "Everything is prepared for the next board position.",
	},
	analyzing: {
		label: "Analyzing",
		tone: "bg-sky-200/80 text-sky-900",
		description: "The engine is actively calculating lines right now.",
	},
	error: {
		label: "Error",
		tone: "bg-rose-200/80 text-rose-900",
		description: "The engine needs to be restarted before it can analyze.",
	},
};

const saveStateMeta: Record<SaveState, { label: string; tone: string }> = {
	idle: {
		label: "Auto save",
		tone: "bg-white/65 text-slate-600",
	},
	saving: {
		label: "Saving...",
		tone: "bg-amber-200/70 text-amber-950",
	},
	saved: {
		label: "Saved",
		tone: "bg-emerald-200/75 text-emerald-950",
	},
	error: {
		label: "Save failed",
		tone: "bg-rose-200/80 text-rose-950",
	},
};

const formatMoveTime = (moveTimeMs: number) => {
	return `${(moveTimeMs / 1000).toFixed(1)}s`;
};

const getProfileSummary = (settings: ExtensionSettings) => {
	const profileValue =
		settings.analysisMode === "depth"
			? `Depth ${settings.depth}`
			: `Move time ${formatMoveTime(settings.moveTimeMs)}`;

	return `${profileValue} • Top ${settings.multiPv} line${
		settings.multiPv > 1 ? "s" : ""
	}`;
};

const PopupSkeleton = () => {
	return (
		<div className="animate-pulse px-5 py-5">
			<div className="rounded-[30px] border border-white/55 bg-white/72 p-6 shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
				<div className="h-3 w-24 rounded-full bg-slate-200/80" />
				<div className="mt-4 h-9 w-40 rounded-full bg-slate-200/80" />
				<div className="mt-4 h-4 w-full rounded-full bg-slate-200/70" />
				<div className="mt-2 h-4 w-3/4 rounded-full bg-slate-200/70" />
			</div>
			<div className="mt-4 space-y-4">
				<div className="h-32 rounded-[28px] bg-white/72" />
				<div className="h-28 rounded-[28px] bg-white/72" />
				<div className="h-36 rounded-[28px] bg-white/72" />
			</div>
		</div>
	);
};

interface ModeButtonProps {
	label: string;
	description: string;
	isSelected: boolean;
	onClick: () => void;
}

const ModeButton = ({
	label,
	description,
	isSelected,
	onClick,
}: ModeButtonProps) => {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`rounded-[22px] border px-4 py-3 text-left transition ${
				isSelected
					? "border-amber-300/90 bg-white text-slate-950 shadow-[0_12px_24px_rgba(202,138,4,0.12)]"
					: "border-transparent bg-white/40 text-slate-600 hover:border-white/70 hover:bg-white/70"
			}`}
		>
			<p className="text-sm font-semibold">{label}</p>
			<p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
		</button>
	);
};

interface SliderCardProps {
	eyebrow: string;
	title: string;
	description: string;
	valueLabel: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (value: number) => void;
	footerLabel: string;
}

const SliderCard = ({
	eyebrow,
	title,
	description,
	valueLabel,
	min,
	max,
	step,
	value,
	onChange,
	footerLabel,
}: SliderCardProps) => {
	return (
		<section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white/80 p-5 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
						{eyebrow}
					</p>
					<h3 className="mt-3 text-xl font-semibold text-slate-950">{title}</h3>
					<p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
				</div>
				<div className="rounded-full bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(15,23,42,0.18)]">
					{valueLabel}
				</div>
			</div>
			<div className="mt-6">
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
				<div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-400">
					<span>{min}</span>
					<span>{footerLabel}</span>
					<span>{max}</span>
				</div>
			</div>
		</section>
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
					setErrorMessage(
						"Couldn't load your saved preferences, defaults are shown instead.",
					);
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
					setErrorMessage("Couldn't save changes to Chrome storage.");
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
		<div className="min-h-145 px-5 py-5 text-slate-950">
			<header className="relative overflow-hidden rounded-4xl border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,250,240,0.72))] p-6 shadow-[0_20px_42px_rgba(15,23,42,0.09)] backdrop-blur-xl">
				<div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.36),transparent_58%)]" />
				<div className="relative flex items-start justify-between gap-4">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
							Chess.com Helper
						</p>
						<h1 className="mt-4 font-(family-name:--font-display) text-[30px] font-semibold leading-none tracking-[-0.04em] text-slate-950">
							Live analysis
						</h1>
						<p className="mt-4 max-w-60 text-sm leading-6 text-slate-600">
							Tune the engine once and keep real-time suggestions tight, fast,
							and readable.
						</p>
					</div>
					<div
						className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] ${settings.enabled ? "bg-emerald-200/75 text-emerald-950" : "bg-slate-900/8 text-slate-600"}`}
					>
						{settings.enabled ? "Active" : "Disabled"}
					</div>
				</div>
				<div className="relative mt-6 flex items-center justify-between gap-3">
					<div className="rounded-full bg-white/72 px-3 py-2 text-xs uppercase tracking-[0.24em] text-slate-500 shadow-[0_10px_22px_rgba(15,23,42,0.06)]">
						{getProfileSummary(settings)}
					</div>
					<div
						className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.24em] ${currentSaveMeta.tone}`}
					>
						{currentSaveMeta.label}
					</div>
				</div>
			</header>

			{errorMessage ? (
				<div className="mt-4 rounded-3xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm leading-6 text-rose-900 shadow-[0_14px_26px_rgba(190,24,93,0.08)]">
					{errorMessage}
				</div>
			) : null}

			<div className="mt-4 grid gap-4">
				<section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white/82 p-5 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
								Master switch
							</p>
							<h2 className="mt-3 text-xl font-semibold text-slate-950">
								{settings.enabled
									? "Analysis is running"
									: "Analysis is paused"}
							</h2>
							<p className="mt-2 text-sm leading-6 text-slate-600">
								Turn the extension on or off without losing your current
								profile.
							</p>
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
							className={`relative h-14 w-24 rounded-full border transition ${
								settings.enabled
									? "border-emerald-300/70 bg-emerald-200/70"
									: "border-slate-200 bg-slate-200/85"
							}`}
						>
							<span
								className={`absolute top-1.5 h-11 w-11 rounded-full bg-white shadow-[0_12px_20px_rgba(15,23,42,0.16)] transition ${
									settings.enabled ? "left-[calc(100%-3.35rem)]" : "left-1.5"
								}`}
							/>
						</button>
					</div>
				</section>

				<section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-white/80 p-5 shadow-[0_18px_34px_rgba(15,23,42,0.08)] backdrop-blur-md">
					<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
						Analysis mode
					</p>
					<div className="mt-4 grid grid-cols-2 gap-3">
						<ModeButton
							label="Depth"
							description="Stable quality per move, great for consistent board scans."
							isSelected={settings.analysisMode === "depth"}
							onClick={() => {
								setAnalysisMode("depth");
							}}
						/>
						<ModeButton
							label="Move time"
							description="Bound each search by time when you want steady latency."
							isSelected={settings.analysisMode === "moveTime"}
							onClick={() => {
								setAnalysisMode("moveTime");
							}}
						/>
					</div>
				</section>

				{settings.analysisMode === "depth" ? (
					<SliderCard
						eyebrow="Search depth"
						title="Calculation depth"
						description="Higher depth usually means stronger suggestions, but more work for each fresh position."
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
						footerLabel="Sharper lines"
					/>
				) : (
					<SliderCard
						eyebrow="Move budget"
						title="Time per move"
						description="Keep analysis responsive by capping the thinking time for each fresh position."
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
						footerLabel="Faster updates"
					/>
				)}

				<SliderCard
					eyebrow="Line count"
					title="MultiPV"
					description="Control how many candidate moves the extension should surface for each position."
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
					footerLabel="Best lines"
				/>

				<section className="rounded-[28px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(30,41,59,0.94))] p-5 text-white shadow-[0_18px_34px_rgba(15,23,42,0.14)]">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
								Runtime status
							</p>
							<h3 className="mt-3 text-xl font-semibold">Engine overview</h3>
						</div>
						<div
							className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] ${currentEngineMeta.tone}`}
						>
							{currentEngineMeta.label}
						</div>
					</div>
					<p className="mt-4 text-sm leading-6 text-slate-300">
						{currentEngineMeta.description}
					</p>
					<div className="mt-5 grid gap-3 text-sm text-slate-200">
						<div className="flex items-center justify-between rounded-[20px] bg-white/6 px-4 py-3">
							<span className="text-slate-400">Profile</span>
							<span className="font-medium text-white">
								{getProfileSummary(settings)}
							</span>
						</div>
						<div className="flex items-center justify-between rounded-[20px] bg-white/6 px-4 py-3">
							<span className="text-slate-400">Storage</span>
							<span className="font-medium text-white">Global auto-save</span>
						</div>
						<div className="flex items-center justify-between rounded-[20px] bg-white/6 px-4 py-3">
							<span className="text-slate-400">Extension</span>
							<span className="font-medium text-white">
								{settings.enabled ? "Watching boards" : "Standing by"}
							</span>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
