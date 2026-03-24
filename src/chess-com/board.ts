import {
	type ChessFile,
	type ChessRank,
	FILE_TO_NUMBER,
	type PlayerColor,
	type Square,
} from "../types/chess";
import { coordToFile } from "../utils/chess";

/** Chess.com board element type */
type ChessBoardElement = HTMLElement & {
	shadowRoot?: ShadowRoot;
};

/**
 * Board Service - Manages interaction with chess.com board
 */
export class ChessComBoard {
	private boardElement: ChessBoardElement | null = null;
	private lastFEN: string | null = null;

	public getBoard(): ChessBoardElement | null {
		if (this.boardElement?.isConnected) {
			return this.boardElement;
		}

		this.boardElement = this.findBoard();
		return this.boardElement;
	}

	private findBoard(): ChessBoardElement | null {
		return document.querySelector("wc-chess-board");
	}

	/**
	 * Generate FEN string from current board position
	 */
	private generateFEN(): string | null {
		const board = this.getBoard();
		if (!board) return null;

		const fenRanks: string[] = [];
		const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as ChessRank[];
		const files = Object.keys(FILE_TO_NUMBER) as ChessFile[];

		for (const rank of ranks) {
			let emptySquareCount = 0;
			let rankFEN = "";

			for (const file of files) {
				const square: Square = `${file}${rank}`;
				const pieceSymbol = this.getPieceSymbol(square);

				if (pieceSymbol) {
					if (emptySquareCount > 0) {
						rankFEN += emptySquareCount;
						emptySquareCount = 0;
					}

					rankFEN += pieceSymbol;
				} else {
					emptySquareCount++;
				}
			}

			if (emptySquareCount > 0) {
				rankFEN += emptySquareCount;
			}

			fenRanks.push(rankFEN);
		}

		return fenRanks.join("/");
	}

	public getTurnMarker(): PlayerColor | null {
		const lastMove = this.getLastMove();
		if (!lastMove) {
			return null;
		}

		const pieceSymbol = this.getPieceSymbol(lastMove.to);
		if (!pieceSymbol) {
			return null;
		}

		const isWhiteMove = pieceSymbol === pieceSymbol.toUpperCase();
		return isWhiteMove ? "b" : "w";
	}

	public generateFullFEN(): string | null {
		const fen = this.generateFEN();
		const turnMarker = this.getTurnMarker();

		if (!fen) return null;

		return `${fen} ${turnMarker || "w"} QKqk - 0 1`;
	}

	/**
	 * Check if board state has changed
	 */
	public hasBoardChanged(): boolean {
		const currentState = this.generateFEN();
		const hasChanged = currentState !== this.lastFEN;

		if (hasChanged) {
			this.lastFEN = currentState;
		}

		return hasChanged;
	}

	private getPieceSymbol(square: Square): string | null {
		const element = this.getPieceElement(square);
		if (!element) return null;

		for (const cssClass of Array.from(element.classList)) {
			if (cssClass.length === 2 && /^[wb][prnbqk]$/.test(cssClass)) {
				const color = cssClass[0];
				const piece = cssClass[1];
				return color === "w" ? piece.toUpperCase() : piece.toLowerCase();
			}
		}
		return null;
	}

	private getPieceElement(square: Square): Element | null {
		const board = this.getBoard();
		if (!board) return null;

		const fileNum = FILE_TO_NUMBER[square[0] as keyof typeof FILE_TO_NUMBER];
		const squareSelector = `.piece.square-${fileNum}${square[1]}`;
		return board.querySelector(squareSelector);
	}

	private parseHighlightedSquare(element: Element): Square | null {
		const squareClass = Array.from(element.classList).find((cssClass) =>
			/^square-[1-8][1-8]$/.test(cssClass),
		);
		if (!squareClass) return null;

		const match = /^square-([1-8])([1-8])$/.exec(squareClass);
		if (!match) return null;

		const file = coordToFile(Number.parseInt(match[1], 10));
		const rank = Number.parseInt(match[2], 10) as ChessRank;
		if (!file) return null;

		return `${file}${rank}`;
	}

	private getLastMove(): { from: Square; to: Square } | null {
		const board = this.getBoard();
		if (!board) return null;

		const highlightedSquares = Array.from(board.querySelectorAll(".highlight"))
			.filter((element) => !element.classList.contains("suggestion-highlight"))
			.map((element) => this.parseHighlightedSquare(element))
			.filter((square): square is Square => square !== null);
		console.debug(
			"Highlighted squares detected for last move:",
			highlightedSquares,
		);

		if (highlightedSquares.length !== 2) return null;

		const [firstSquare, secondSquare] = highlightedSquares;
		const firstPiece = this.getPieceSymbol(firstSquare);
		const secondPiece = this.getPieceSymbol(secondSquare);
		console.debug("Pieces on highlighted squares:", {
			[firstSquare]: firstPiece,
			[secondSquare]: secondPiece,
		});

		const move =
			!firstPiece && secondPiece
				? { from: firstSquare, to: secondSquare }
				: { from: secondSquare, to: firstSquare };
		console.debug("Inferred last move:", move);
		return move;
	}
}

/** Singleton instance */
export const boardService = new ChessComBoard();
