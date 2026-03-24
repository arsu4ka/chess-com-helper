export const validateFen = (fen: string) => {
	const parts = fen.trim().split(/\s+/);

	if (parts.length !== 6) return false;

	const [board, activeColor, castling, enPassant, halfmove, fullmove] = parts;
	const ranks = board.split("/");

	if (ranks.length !== 8) return false;

	for (const rank of ranks) {
		let squares = 0;

		for (const symbol of rank) {
			if (/^[1-8]$/.test(symbol)) {
				squares += Number.parseInt(symbol, 10);
				continue;
			}

			if (!/^[prnbqkPRNBQK]$/.test(symbol)) return false;

			squares += 1;
		}

		if (squares !== 8) return false;
	}

	if (!/^[wb]$/.test(activeColor)) return false;
	if (!/^(-|[KQkq]+)$/.test(castling)) return false;
	if (!/^(-|[a-h][36])$/.test(enPassant)) return false;
	if (!/^\d+$/.test(halfmove)) return false;
	if (!/^[1-9]\d*$/.test(fullmove)) return false;

	return true;
};
