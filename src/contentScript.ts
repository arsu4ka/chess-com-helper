import { boardService } from "./chess-com/board";
import { clearHighlights, displayMoveHighlight } from "./chess-com/highlight";
import { analyzePosition, stopStockfishAnalysis } from "./engine/client";
import { EngineClientError } from "./engine/protocol";
import {
	getExtensionSettings,
	normalizeExtensionSettings,
	SETTINGS_STORAGE_KEY,
} from "./settings";
import type { UCIMove } from "./types/chess";
import { waitForElement } from "./utils/dom";

const BOARD_SELECTOR = "wc-chess-board";
const BOARD_MUTATION_DEBOUNCE_MS = 120;

let isEnabled = true;
let analysisGeneration = 0;
let boardMutationTimer: number | null = null;

const clearBoardHighlights = () => {
	const board = boardService.getBoard();
	if (!board) return;

	clearHighlights(board);
};

const loadEnabledState = async () => {
	const settings = await getExtensionSettings();
	isEnabled = settings.enabled;
};

const handleSettingsChanged = async (
	changes: { [key: string]: chrome.storage.StorageChange },
	areaName: string,
) => {
	if (areaName !== "sync") return;

	const settingsChange = changes[SETTINGS_STORAGE_KEY];
	if (!settingsChange) return;

	isEnabled = normalizeExtensionSettings(settingsChange.newValue).enabled;

	if (!isEnabled) {
		analysisGeneration += 1;
		clearBoardHighlights();
		await stopStockfishAnalysis().catch(() => undefined);
	}
};

const processBoardChange = async () => {
	if (!boardService.hasBoardChanged()) return;

	const board = boardService.getBoard();
	if (!board) return;

	analysisGeneration += 1;
	const currentGeneration = analysisGeneration;

	clearHighlights(board);

	if (!isEnabled) return;

	const fen = boardService.generateFullFEN();
	if (!fen) return;

	try {
		const analysis = await analyzePosition({ fen });

		if (currentGeneration !== analysisGeneration) return;

		const currentBoard = boardService.getBoard();
		if (!currentBoard) return;

		if (analysis.bestMove) {
			displayMoveHighlight(analysis.bestMove.uci as UCIMove, currentBoard);
		}

		console.log("Stockfish analysis:", analysis);
	} catch (error) {
		if (
			error instanceof EngineClientError &&
			error.code === "EXTENSION_DISABLED"
		) {
			return;
		}

		console.error("Failed to analyze current board position.", error);
	}
};

const scheduleBoardCheck = () => {
	if (boardMutationTimer) {
		window.clearTimeout(boardMutationTimer);
	}

	boardMutationTimer = window.setTimeout(() => {
		void processBoardChange();
	}, BOARD_MUTATION_DEBOUNCE_MS);
};

async function startAnalyzer() {
	await loadEnabledState();
	chrome.storage.onChanged.addListener(handleSettingsChanged);

	await waitForElement(BOARD_SELECTOR);

	const board = boardService.getBoard();
	if (!board) return;

	const observer = new MutationObserver(() => {
		scheduleBoardCheck();
	});

	observer.observe(board, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ["class", "style"],
	});

	scheduleBoardCheck();
}

// Wait for DOM to be ready
if (
	document.readyState === "complete" ||
	document.readyState === "interactive"
) {
	startAnalyzer();
} else {
	document.addEventListener("DOMContentLoaded", startAnalyzer);
}
