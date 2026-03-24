import type { UCIMove } from "../types/chess";
import { fileToCoord, parseUCIMove } from "../utils/chess";
import { createElement } from "../utils/dom";

const HIGHLIGHT_CLASS = "suggestion-highlight";
const HIGHLIGHT_COLOR = "231, 76, 60";
const MAX_HIGHLIGHT_OPACITY = 1;
const MIN_HIGHLIGHT_OPACITY = 0.2;

/**
 * Clear all existing highlights from the board
 */
export function clearHighlights(board: Element): void {
	board
		.querySelectorAll(`.${HIGHLIGHT_CLASS}`)
		.forEach((el) => void el.remove());

	// resetPieceOpacity(board);
}

/**
 * Reset piece opacity to default
 */
// export function resetPieceOpacity(board: Element): void {
// 	const allPieces = board.querySelectorAll(".piece");
// 	allPieces.forEach((piece) => {
// 		if (piece instanceof HTMLElement) {
// 			piece.style.opacity = "1";
// 		}
// 	});
// }

/**
 * Dim all pieces except highlighted ones
 */
// export function dimPieces(board: Element, excludeSquares: string[]): void {
// 	const allPieces = board.querySelectorAll(".piece");
// 	allPieces.forEach((piece) => {
// 		if (piece instanceof HTMLElement) {
// 			const isExcluded = excludeSquares.some((square) =>
// 				piece.classList.contains(`square-${square}`),
// 			);
// 			piece.style.opacity = isExcluded ? "1" : "0.8";
// 		}
// 	});
// }

const getMoveHighlightOpacity = (index: number, totalMoves: number): number => {
	if (totalMoves <= 1) {
		return MAX_HIGHLIGHT_OPACITY;
	}

	const opacityRange = MAX_HIGHLIGHT_OPACITY - MIN_HIGHLIGHT_OPACITY;
	return MAX_HIGHLIGHT_OPACITY - (opacityRange * index) / (totalMoves - 1);
};

const createSquareHighlight = (squareCoord: string, opacity: number) => {
	return createElement(
		"div",
		{
			border: `4px solid rgba(${HIGHLIGHT_COLOR}, ${opacity})`,
			boxSizing: "border-box",
			pointerEvents: "none",
			borderRadius: "4px",
			boxShadow: `0 0 18px rgba(${HIGHLIGHT_COLOR}, ${opacity})`,
			background: `rgba(${HIGHLIGHT_COLOR}, ${Math.min(opacity * 0.18, 0.16)})`,
			position: "absolute",
			zIndex: "1000",
		},
		{
			class: `highlight ${HIGHLIGHT_CLASS} square-${squareCoord}`,
		},
	);
};

const moveToBoardSquares = (move: UCIMove): [string, string] => {
	const { from, to } = parseUCIMove(move);
	const startSquare = `${fileToCoord(from[0])}${from[1]}`;
	const endSquare = `${fileToCoord(to[0])}${to[1]}`;
	return [startSquare, endSquare];
};

export function displayMoveHighlights(moves: UCIMove[], board: Element): void {
	clearHighlights(board);

	const uniqueMoves = moves.filter(
		(move, index) => moves.indexOf(move) === index,
	);
	const totalMoves = uniqueMoves.length;

	uniqueMoves.forEach((move, index) => {
		const opacity = getMoveHighlightOpacity(index, totalMoves);

		moveToBoardSquares(move).forEach((squareCoord) => {
			board.appendChild(createSquareHighlight(squareCoord, opacity));
		});
	});
}

/**
 * Display move suggestion highlight on the board
 */
export function displayMoveHighlight(move: UCIMove, board: Element): void {
	displayMoveHighlights([move], board);
}
