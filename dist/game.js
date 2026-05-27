import { getPiece, setPiece } from './board.js';
import { getLegalMoves, getAllLegalMoves, isInCheck } from './moves.js';
import { getPieceConfig } from './piece-config.js';
function hasNoPieces(state, color) {
    for (let row = 0; row < state.height; row++) {
        for (let col = 0; col < state.width; col++) {
            const piece = state.board[row][col];
            if (piece && piece.color === color)
                return false;
        }
    }
    return true;
}
function advanceTurn(state) {
    state.turn = state.turn === 'white' ? 'black' : 'white';
    // In visitedAll mode, skip players with no pieces
    if (state.victoryCondition.type === 'visitedAll') {
        const opponent = state.turn === 'white' ? 'black' : 'white';
        if (hasNoPieces(state, state.turn) && !hasNoPieces(state, opponent)) {
            state.turn = opponent;
        }
    }
}
export function makeMove(state, move) {
    const legalMoves = getLegalMoves(state, move.from);
    const isLegal = legalMoves.some(m => m.to.row === move.to.row && m.to.col === move.to.col && m.promotion === move.promotion);
    if (!isLegal)
        return null;
    const piece = getPiece(state, move.from);
    if (!piece)
        return null;
    const result = {
        move,
        captured: getPiece(state, move.to),
        wasEnPassant: false,
        wasCastling: false,
        wasJumpCapture: false,
    };
    const typeConfig = getPieceConfig().pieceTypes[piece.type];
    // Detect jump capture from config
    let jumpCaptured = null;
    if (typeConfig) {
        for (const behavior of typeConfig.behaviors) {
            if (!behavior.jumpCapture)
                continue;
            for (const [vdx, vdyRaw] of behavior.vectors) {
                const vdy = piece.color === 'white' ? vdyRaw : -vdyRaw;
                const drow = move.to.row - move.from.row;
                const dcol = move.to.col - move.from.col;
                const matchesVector = behavior.slide
                    ? (drow !== 0 || dcol !== 0) && Math.sign(drow) === Math.sign(vdy) && Math.sign(dcol) === Math.sign(vdx)
                    : (drow === vdy && dcol === vdx);
                if (matchesVector) {
                    if (behavior.slide) {
                        const dr = Math.sign(vdy);
                        const dc = Math.sign(vdx);
                        let r = move.from.row + dr;
                        let c = move.from.col + dc;
                        while (r !== move.to.row || c !== move.to.col) {
                            const mid = { row: r, col: c };
                            const midPiece = getPiece(state, mid);
                            if (midPiece && midPiece.color !== piece.color) {
                                jumpCaptured = midPiece;
                                setPiece(state, mid, null);
                                break;
                            }
                            r += dr;
                            c += dc;
                        }
                    }
                    else {
                        const midPos = { row: (move.from.row + move.to.row) / 2, col: (move.from.col + move.to.col) / 2 };
                        const midPiece = getPiece(state, midPos);
                        if (midPiece && midPiece.color !== piece.color) {
                            jumpCaptured = midPiece;
                            setPiece(state, midPos, null);
                        }
                    }
                    if (jumpCaptured) {
                        result.wasJumpCapture = true;
                        result.captured = jumpCaptured;
                    }
                }
            }
        }
    }
    // Handle en passant
    if (typeConfig?.special?.includes('enPassant') && state.enPassantTarget &&
        move.to.row === state.enPassantTarget.row &&
        move.to.col === state.enPassantTarget.col &&
        move.from.col !== move.to.col) {
        const capturedPawnRow = piece.color === 'white' ? move.to.row + 1 : move.to.row - 1;
        result.captured = getPiece(state, { row: capturedPawnRow, col: move.to.col });
        setPiece(state, { row: capturedPawnRow, col: move.to.col }, null);
        result.wasEnPassant = true;
    }
    // Handle castling via config
    if (typeConfig?.special?.includes('castling') && typeConfig.castling) {
        const kingDy = move.to.row - move.from.row;
        const kingDx = move.to.col - move.from.col;
        for (const rule of typeConfig.castling) {
            const expectedDy = piece.color === 'white' ? rule.kingTarget[1] : -rule.kingTarget[1];
            if (kingDx === rule.kingTarget[0] && kingDy === expectedDy) {
                result.wasCastling = true;
                const partnerTargetCol = move.to.col + rule.partnerTarget[0];
                const partnerTargetRow = move.to.row + (piece.color === 'white' ? rule.partnerTarget[1] : -rule.partnerTarget[1]);
                const searchDir = -rule.searchDirection;
                let c = move.to.col + searchDir;
                while (isInsideBoard(state, { row: move.to.row, col: c })) {
                    const p = getPiece(state, { row: move.to.row, col: c });
                    if (p && p.type === rule.partnerType && p.color === piece.color) {
                        result.rookMove = { from: { row: move.to.row, col: c }, to: { row: partnerTargetRow, col: partnerTargetCol } };
                        setPiece(state, { row: partnerTargetRow, col: partnerTargetCol }, p);
                        setPiece(state, { row: move.to.row, col: c }, null);
                        break;
                    }
                    c += searchDir;
                }
                break;
            }
        }
    }
    // Handle promotion
    if (move.promotion) {
        setPiece(state, move.to, { id: piece.id, type: move.promotion, color: piece.color });
        result.promotion = move.promotion;
    }
    else {
        setPiece(state, move.to, piece);
    }
    setPiece(state, move.from, null);
    // Mark piece as moved
    state.pieceHasMoved[move.to.row][move.to.col] = true;
    // Update visited squares
    state.visitedSquares[move.to.row][move.to.col] = true;
    // Update piece history
    const history = state.pieceHistory.get(piece.id);
    if (history) {
        history[move.to.row][move.to.col] = true;
    }
    // Update en passant target
    if (typeConfig?.special?.includes('enPassant') && Math.abs(move.to.row - move.from.row) === 2) {
        state.enPassantTarget = {
            row: (move.from.row + move.to.row) / 2,
            col: move.from.col,
        };
    }
    else {
        state.enPassantTarget = null;
    }
    // Update clocks
    if (typeConfig?.special?.includes('enPassant') || result.captured) {
        state.halfmoveClock = 0;
    }
    else {
        state.halfmoveClock++;
    }
    if (state.turn === 'black') {
        state.fullmoveNumber++;
    }
    advanceTurn(state);
    return result;
}
function isInsideBoard(state, pos) {
    return pos.row >= 0 && pos.row < state.height && pos.col >= 0 && pos.col < state.width;
}
export function isCheckmate(state) {
    if (!isInCheck(state, state.turn))
        return false;
    const moves = getAllLegalMoves(state, state.turn);
    return moves.length === 0;
}
export function isStalemate(state) {
    if (isInCheck(state, state.turn))
        return false;
    const moves = getAllLegalMoves(state, state.turn);
    return moves.length === 0;
}
function hasNoTargetPiece(state, color, targetType) {
    for (let row = 0; row < state.height; row++) {
        for (let col = 0; col < state.width; col++) {
            const piece = state.board[row][col];
            if (piece && piece.color === color && piece.type === targetType)
                return false;
        }
    }
    return true;
}
function hasNoLegalMoves(state, color) {
    return getAllLegalMoves(state, color).length === 0;
}
function allNonWallSquaresVisited(state) {
    for (let row = 0; row < state.height; row++) {
        for (let col = 0; col < state.width; col++) {
            if (state.squares[row][col] !== 'wall' && !state.visitedSquares[row][col]) {
                return false;
            }
        }
    }
    return true;
}
export function isVictory(state) {
    const current = state.turn;
    const opponent = current === 'white' ? 'black' : 'white';
    const cond = state.victoryCondition;
    // Move count limit exceeded
    if (state.moveCountLimit > 0 && state.fullmoveNumber > state.moveCountLimit) {
        return { winner: opponent, reason: 'Лимит ходов исчерпан' };
    }
    switch (cond.type) {
        case 'checkmate': {
            if (isCheckmate(state)) {
                return { winner: opponent, reason: 'Мат!' };
            }
            break;
        }
        case 'annihilation': {
            if (hasNoPieces(state, current)) {
                return { winner: opponent, reason: 'Все фигуры съедены!' };
            }
            break;
        }
        case 'target': {
            if (cond.targetPiece && hasNoTargetPiece(state, current, cond.targetPiece)) {
                return { winner: opponent, reason: `${cond.targetPiece} потерян!` };
            }
            break;
        }
        case 'visitedAll': {
            if (allNonWallSquaresVisited(state)) {
                // Determine winner: if only one side has pieces, they win
                if (hasNoPieces(state, 'white') && !hasNoPieces(state, 'black')) {
                    return { winner: 'black', reason: 'Все клетки посещены!' };
                }
                else if (hasNoPieces(state, 'black') && !hasNoPieces(state, 'white')) {
                    return { winner: 'white', reason: 'Все клетки посещены!' };
                }
                return { winner: opponent, reason: 'Все клетки посещены!' };
            }
            break;
        }
    }
    return null;
}
export function isGameOver(state) {
    if (state.gameTimedOut)
        return true;
    if (isVictory(state))
        return true;
    if (hasNoLegalMoves(state, state.turn))
        return true;
    return false;
}
export function getGameStatus(state) {
    if (state.gameTimedOut) {
        return 'Время вышло! Игра окончена';
    }
    const victory = isVictory(state);
    if (victory) {
        const winnerName = victory.winner === 'white' ? 'Белые' : 'Чёрные';
        return `${winnerName} победили! ${victory.reason}`;
    }
    if (hasNoLegalMoves(state, state.turn)) {
        if (state.victoryCondition.type === 'visitedAll') {
            return 'Нет ходов! Игра окончена';
        }
        return 'Пат! Ничья';
    }
    if (state.moveCountLimit > 0) {
        const remaining = state.moveCountLimit - state.fullmoveNumber + (state.turn === 'white' ? 1 : 0);
        if (remaining > 0) {
            return state.turn === 'white' ? `Ход белых (осталось ${remaining})` : `Ход чёрных (осталось ${remaining})`;
        }
    }
    if (isInCheck(state, state.turn)) {
        return state.turn === 'white' ? 'Белым шах!' : 'Чёрным шах!';
    }
    return state.turn === 'white' ? 'Ход белых' : 'Ход чёрных';
}
