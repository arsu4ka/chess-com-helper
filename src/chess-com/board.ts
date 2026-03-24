import {
	type ChessFile,
	type ChessRank,
	FILE_TO_NUMBER,
	type PlayerColor,
	type Square,
} from "../types/chess";

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
		if (this.boardElement) {
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

		let fen = "";
		const ranks = Object.values(FILE_TO_NUMBER) as ChessRank[];
		const files = Object.keys(FILE_TO_NUMBER) as ChessFile[];

		for (const rank of ranks) {
			let emptySquareCount = 0;

			for (const file of files) {
				const square: Square = `${file}${rank}`;
				const pieceSymbol = this.getPieceSymbol(square);

				if (pieceSymbol) {
					if (emptySquareCount > 0) {
						fen += emptySquareCount;
						emptySquareCount = 0;
					}

					fen += pieceSymbol;
				} else {
					emptySquareCount++;
				}
			}

			if (emptySquareCount > 0) {
				fen += emptySquareCount;
			}

			if (rank > 1) {
				fen += "/";
			}
		}

		return fen;
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

		return `${fen} ${turnMarker || "w"}`;
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

	private getLastMove(): { from: Square; to: Square } | null {
		const board = this.getBoard();
		if (!board) return null;

		// TODO: Implement actual logic to determine last move based on board state
		return {
			from: "e2",
			to: "e4",
		};
	}
}

/** Singleton instance */
export const boardService = new ChessComBoard();
