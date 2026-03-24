import type { UCIMove } from "../types/chess";
import { validateFen } from "../utils/chess";
import { clamp, parseInteger, toInteger } from "../utils/math";
import { createDeferred, type Deferred, waitFor } from "../utils/promises";
import type {
	AnalysisMove,
	AnalysisResult,
	AnalyzePositionInput,
	EngineErrorCode,
	EngineStatus,
} from "./protocol";

const ENGINE_SCRIPT_PATH = "vendor/stockfish/stockfish-18-lite-single.js";
const ENGINE_WASM_PATH = "vendor/stockfish/stockfish-18-lite-single.wasm";
const DEFAULT_ANALYSIS_DEPTH = 15;
const DEFAULT_MULTI_PV = 3;
const MAX_MULTI_PV = 5;
const READY_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 2_000;

interface ActiveAnalysis {
	fen: string;
	bestMoveUci: string | null;
	lastDepth: number;
	multiPv: number;
	movesByIndex: Map<number, AnalysisMove>;
	result: Deferred<AnalysisResult>;
	stopped: Deferred<void>;
	isAbortRequested: boolean;
	isSettled: boolean;
}

interface NormalizedAnalyzePositionInput {
	fen: string;
	depth: number;
	moveTimeMs?: number;
	multiPv: number;
}

class EngineServiceError extends Error {
	code: EngineErrorCode;

	constructor(code: EngineErrorCode, message: string) {
		super(message);
		this.name = "EngineServiceError";
		this.code = code;
	}
}

const createAbortError = () =>
	new EngineServiceError("ANALYSIS_ABORTED", "The analysis was aborted.");

const parseInfoLine = (line: string): AnalysisMove | null => {
	if (!line.startsWith("info ")) return null;

	const tokens = line.trim().split(/\s+/);
	let depth = 0;
	let multiPv = 1;
	let scoreCp: number | null = null;
	let mateIn: number | null = null;
	let pv: string[] = [];

	for (let index = 1; index < tokens.length; index += 1) {
		const token = tokens[index];

		if (token === "depth") {
			depth = parseInteger(tokens[index + 1]) ?? depth;
			index += 1;
			continue;
		}

		if (token === "multipv") {
			multiPv = parseInteger(tokens[index + 1]) ?? multiPv;
			index += 1;
			continue;
		}

		if (token === "score") {
			const kind = tokens[index + 1];
			const scoreValue = parseInteger(tokens[index + 2]);

			if (kind === "cp") scoreCp = scoreValue;
			if (kind === "mate") mateIn = scoreValue;

			index += 2;
			continue;
		}

		if (token === "pv") {
			pv = tokens.slice(index + 1);
			break;
		}
	}

	if (pv.length === 0) return null;

	return {
		uci: pv[0] as UCIMove,
		depth,
		scoreCp,
		mateIn,
		pv,
	};
};

const parseBestMove = (line: string) => {
	if (!line.startsWith("bestmove ")) return null;

	const match = /^bestmove\s+(\S+)/.exec(line);
	return match?.[1] ?? null;
};

export class StockfishEngineService {
	private worker: Worker | null = null;
	private status: EngineStatus = "idle";
	private initPromise: Promise<void> | null = null;
	private uciReady: Deferred<void> | null = null;
	private readyWaiters: Deferred<void>[] = [];
	private currentAnalysis: ActiveAnalysis | null = null;

	getStatus() {
		return this.status;
	}

	async init() {
		if (this.status === "ready" || this.status === "analyzing") return;
		if (this.initPromise) return this.initPromise;

		this.initPromise = this.initializeWorker().finally(() => {
			this.initPromise = null;
		});

		return this.initPromise;
	}

	async analyzePosition(input: AnalyzePositionInput): Promise<AnalysisResult> {
		const normalizedInput = this.normalizeAnalyzePositionInput(input);

		await this.init();
		await this.stopActiveAnalysis();
		await this.ensureReady();

		const activeAnalysis: ActiveAnalysis = {
			fen: normalizedInput.fen,
			bestMoveUci: null,
			lastDepth: 0,
			multiPv: normalizedInput.multiPv,
			movesByIndex: new Map(),
			result: createDeferred<AnalysisResult>(),
			stopped: createDeferred<void>(),
			isAbortRequested: false,
			isSettled: false,
		};

		this.currentAnalysis = activeAnalysis;
		this.status = "analyzing";

		this.sendCommand("ucinewgame");
		this.sendCommand(`setoption name MultiPV value ${normalizedInput.multiPv}`);
		this.sendCommand(`position fen ${normalizedInput.fen}`);
		this.sendCommand(this.createGoCommand(normalizedInput));

		return activeAnalysis.result.promise;
	}

	async stopAnalysis() {
		await this.stopActiveAnalysis();

		if (this.status !== "error") {
			this.status = this.worker ? "ready" : "idle";
		}
	}

	async reset() {
		await this.init();
		await this.stopActiveAnalysis();
		await this.ensureReady();
		this.sendCommand("ucinewgame");
		this.sendCommand("setoption name Clear Hash value true");
		await this.ensureReady();
	}

	private async initializeWorker() {
		this.disposeWorker();

		this.status = "loading";
		this.uciReady = createDeferred<void>();

		try {
			const wasmUrl = chrome.runtime.getURL(ENGINE_WASM_PATH);
			const scriptUrl = chrome.runtime.getURL(ENGINE_SCRIPT_PATH);
			const workerUrl = `${scriptUrl}#${encodeURIComponent(wasmUrl)}`;

			console.debug("Starting Stockfish worker", {
				scriptUrl,
				wasmUrl,
				workerUrl,
			});

			this.worker = new Worker(workerUrl);
			this.worker.addEventListener("message", this.handleWorkerMessage);
			this.worker.addEventListener("error", this.handleWorkerError);

			this.sendCommand("uci");
			await this.withTimeout(
				this.uciReady.promise,
				READY_TIMEOUT_MS,
				"ENGINE_LOAD_FAILED",
				"Timed out while waiting for Stockfish to initialize.",
			);
			await this.ensureReady();

			this.status = "ready";
		} catch (error) {
			this.status = "error";
			this.disposeWorker();

			throw this.normalizeError(
				error,
				"ENGINE_LOAD_FAILED",
				"Failed to load the Stockfish engine.",
			);
		}
	}

	private async ensureReady() {
		if (!this.worker) {
			throw new EngineServiceError(
				"ENGINE_NOT_READY",
				"Stockfish worker is not initialized.",
			);
		}

		const waiter = createDeferred<void>();
		this.readyWaiters.push(waiter);

		this.sendCommand("isready");

		await this.withTimeout(
			waiter.promise,
			READY_TIMEOUT_MS,
			"ENGINE_NOT_READY",
			"Timed out while waiting for the engine to become ready.",
		);
	}

	private async stopActiveAnalysis() {
		const activeAnalysis = this.currentAnalysis;

		if (!activeAnalysis) return;

		activeAnalysis.isAbortRequested = true;

		if (!activeAnalysis.isSettled) {
			activeAnalysis.isSettled = true;
			activeAnalysis.result.reject(createAbortError());
		}

		this.sendCommand("stop");

		const stopCompleted = await Promise.race([
			activeAnalysis.stopped.promise.then(() => true),
			waitFor(STOP_TIMEOUT_MS).then(() => false),
		]);

		if (!stopCompleted) {
			await this.recoverAfterProtocolError(
				"Timed out while stopping the current analysis.",
			);
			return;
		}

		if (this.currentAnalysis === activeAnalysis) {
			this.currentAnalysis = null;
		}

		if (this.status !== "error") {
			this.status = this.worker ? "ready" : "idle";
		}
	}

	private async recoverAfterProtocolError(message: string) {
		const activeAnalysis = this.currentAnalysis;

		if (activeAnalysis && !activeAnalysis.isSettled) {
			activeAnalysis.isSettled = true;
			activeAnalysis.result.reject(
				new EngineServiceError("ENGINE_PROTOCOL_ERROR", message),
			);
		}

		this.currentAnalysis = null;
		this.disposeWorker();
		await this.init();
	}

	private handleWorkerMessage = (event: MessageEvent<string>) => {
		const line = String(event.data ?? "").trim();

		if (!line) return;

		console.debug("Stockfish worker message", line);

		if (line === "uciok") {
			this.uciReady?.resolve();
			this.uciReady = null;
			return;
		}

		if (line === "readyok") {
			const waiter = this.readyWaiters.shift();
			waiter?.resolve();
			return;
		}

		const bestMove = parseBestMove(line);
		if (bestMove) {
			this.finishAnalysis(bestMove);
			return;
		}

		const parsedMove = parseInfoLine(line);
		if (!parsedMove || !this.currentAnalysis) return;

		const moveIndex = line.includes(" multipv ")
			? (parseInteger(line.match(/\bmultipv\s+(\d+)/)?.[1]) ?? 1)
			: 1;

		this.currentAnalysis.lastDepth = Math.max(
			this.currentAnalysis.lastDepth,
			parsedMove.depth,
		);
		this.currentAnalysis.movesByIndex.set(moveIndex, parsedMove);
	};

	private handleWorkerError = (event: ErrorEvent) => {
		console.error("Stockfish worker error", {
			message: event.message,
			filename: event.filename,
			lineno: event.lineno,
			colno: event.colno,
			error: event.error,
		});

		this.status = "error";
		this.uciReady?.reject(
			new EngineServiceError(
				"ENGINE_LOAD_FAILED",
				"Stockfish worker crashed while loading.",
			),
		);
		this.uciReady = null;

		for (const waiter of this.readyWaiters) {
			waiter.reject(
				new EngineServiceError(
					"ENGINE_NOT_READY",
					"Stockfish worker crashed while preparing for analysis.",
				),
			);
		}

		this.readyWaiters = [];

		if (this.currentAnalysis && !this.currentAnalysis.isSettled) {
			this.currentAnalysis.isSettled = true;
			this.currentAnalysis.result.reject(
				new EngineServiceError(
					"ENGINE_PROTOCOL_ERROR",
					"Stockfish worker crashed during analysis.",
				),
			);
		}

		this.currentAnalysis?.stopped.resolve();
		this.currentAnalysis = null;
		this.disposeWorker();
	};

	private finishAnalysis(bestMoveUci: string) {
		const activeAnalysis = this.currentAnalysis;

		if (!activeAnalysis) return;

		activeAnalysis.bestMoveUci = bestMoveUci;
		activeAnalysis.stopped.resolve();

		if (activeAnalysis.isAbortRequested) {
			this.currentAnalysis = null;
			this.status = this.worker ? "ready" : "idle";
			return;
		}

		const moves = Array.from(activeAnalysis.movesByIndex.entries())
			.sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
			.map(([, move]) => move)
			.slice(0, activeAnalysis.multiPv);

		const fallbackBestMove =
			bestMoveUci && bestMoveUci !== "(none)"
				? {
						uci: bestMoveUci,
						depth: activeAnalysis.lastDepth,
						scoreCp: null,
						mateIn: null,
						pv: [bestMoveUci],
					}
				: null;

		const bestMove =
			moves.find((move) => move.uci === bestMoveUci) ??
			moves[0] ??
			fallbackBestMove;

		const result: AnalysisResult = {
			fen: activeAnalysis.fen,
			bestMove,
			moves,
			depth: activeAnalysis.lastDepth,
			engine: "stockfish",
		};

		activeAnalysis.isSettled = true;
		activeAnalysis.result.resolve(result);

		this.currentAnalysis = null;
		this.status = this.worker ? "ready" : "idle";
	}

	private createGoCommand(input: NormalizedAnalyzePositionInput) {
		if (typeof input.moveTimeMs === "number" && input.moveTimeMs > 0) {
			return `go movetime ${input.moveTimeMs}`;
		}

		return `go depth ${input.depth}`;
	}

	private normalizeAnalyzePositionInput(
		input: AnalyzePositionInput,
	): NormalizedAnalyzePositionInput {
		const fen = input.fen?.trim();

		if (!fen || !validateFen(fen)) {
			throw new EngineServiceError(
				"INVALID_FEN",
				"Expected a valid FEN string for analysis.",
			);
		}

		return {
			fen,
			depth: clamp(toInteger(input.depth, DEFAULT_ANALYSIS_DEPTH), 1, 50),
			moveTimeMs:
				typeof input.moveTimeMs === "number" && input.moveTimeMs > 0
					? Math.trunc(input.moveTimeMs)
					: undefined,
			multiPv: clamp(
				toInteger(input.multiPv, DEFAULT_MULTI_PV),
				1,
				MAX_MULTI_PV,
			),
		};
	}

	private sendCommand(command: string) {
		if (!this.worker) {
			throw new EngineServiceError(
				"ENGINE_NOT_READY",
				"Stockfish worker is not initialized.",
			);
		}

		this.worker.postMessage(command);
	}

	private async withTimeout<T>(
		promise: Promise<T>,
		timeoutMs: number,
		code: EngineErrorCode,
		message: string,
	) {
		const result = await Promise.race([
			promise.then((value) => ({ ok: true as const, value })),
			waitFor(timeoutMs).then(() => ({ ok: false as const })),
		]);

		if (!result.ok) {
			throw new EngineServiceError(code, message);
		}

		return result.value;
	}

	private normalizeError(
		error: unknown,
		code: EngineErrorCode,
		message: string,
	) {
		if (error instanceof EngineServiceError) return error;
		if (error instanceof Error)
			return new EngineServiceError(code, error.message);
		return new EngineServiceError(code, message);
	}

	private disposeWorker() {
		if (!this.worker) return;

		this.worker.removeEventListener("message", this.handleWorkerMessage);
		this.worker.removeEventListener("error", this.handleWorkerError);
		this.worker.terminate();
		this.worker = null;
	}
}

export const stockfishEngineService = new StockfishEngineService();
export { EngineServiceError };
