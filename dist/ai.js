import { cloneState } from './board.js';
import { getAllLegalMoves } from './moves.js';
import { makeMove, isVictory } from './game.js';
import { getPieceConfig } from './piece-config.js';
const DEFAULT_PIECE_VALUES = {
    pawn: 100,
    knight: 320,
    bishop: 330,
    rook: 500,
    queen: 900,
    king: 20000,
    checker: 150,
    checkerKing: 400,
};
export function getPieceValue(type) {
    const config = getPieceConfig();
    const typeConfig = config.pieceTypes[type];
    if (typeConfig?.value !== undefined) {
        return typeConfig.value;
    }
    return DEFAULT_PIECE_VALUES[type] ?? 0;
}
// Simple piece-square tables (from white's perspective, flip for black)
const PAWN_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
];
const KNIGHT_TABLE = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
];
const BISHOP_TABLE = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
];
const ROOK_TABLE = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
];
const QUEEN_TABLE = [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
];
const KING_MIDDLE_TABLE = [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
];
const CHECKER_TABLE = Array.from({ length: 8 }, () => Array(8).fill(0));
const CHECKER_KING_TABLE = Array.from({ length: 8 }, () => Array(8).fill(0));
const TABLES = {
    pawn: PAWN_TABLE,
    knight: KNIGHT_TABLE,
    bishop: BISHOP_TABLE,
    rook: ROOK_TABLE,
    queen: QUEEN_TABLE,
    king: KING_MIDDLE_TABLE,
    checker: CHECKER_TABLE,
    checkerKing: CHECKER_KING_TABLE,
};
function evaluateState(state) {
    let score = 0;
    for (let row = 0; row < state.height; row++) {
        for (let col = 0; col < state.width; col++) {
            const piece = state.board[row][col];
            if (!piece)
                continue;
            const value = getPieceValue(piece.type);
            const table = TABLES[piece.type];
            // Clamp row index to table bounds for non-standard board sizes
            const tableRow = Math.min(piece.color === 'white' ? row : 7 - row, 7);
            const tableCol = Math.min(col, 7);
            const posValue = table[tableRow][tableCol];
            const total = value + posValue;
            score += piece.color === 'white' ? total : -total;
        }
    }
    return state.turn === 'white' ? score : -score;
}
function sortMoves(state, moves) {
    return moves.sort((a, b) => {
        const aPiece = state.board[a.to.row][a.to.col];
        const bPiece = state.board[b.to.row][b.to.col];
        const aCapture = aPiece ? getPieceValue(aPiece.type) : 0;
        const bCapture = bPiece ? getPieceValue(bPiece.type) : 0;
        return bCapture - aCapture;
    });
}
function minimax(state, depth, alpha, beta, maximizing) {
    if (depth === 0) {
        return evaluateState(state);
    }
    const moves = getAllLegalMoves(state, state.turn);
    if (moves.length === 0) {
        if (isVictory(state)) {
            return maximizing ? -100000 + depth : 100000 - depth;
        }
        return 0; // stalemate
    }
    const sortedMoves = sortMoves(state, moves);
    if (maximizing) {
        let maxEval = -Infinity;
        for (const move of sortedMoves) {
            const newState = cloneState(state);
            makeMove(newState, move);
            const evalScore = minimax(newState, depth - 1, alpha, beta, false);
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha)
                break;
        }
        return maxEval;
    }
    else {
        let minEval = Infinity;
        for (const move of sortedMoves) {
            const newState = cloneState(state);
            makeMove(newState, move);
            const evalScore = minimax(newState, depth - 1, alpha, beta, true);
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha)
                break;
        }
        return minEval;
    }
}
export function findBestMove(state, depth = 3) {
    const moves = getAllLegalMoves(state, state.turn);
    if (moves.length === 0)
        return null;
    const sortedMoves = sortMoves(state, moves);
    let bestMove = sortedMoves[0];
    let bestValue = -Infinity;
    for (const move of sortedMoves) {
        const newState = cloneState(state);
        makeMove(newState, move);
        const value = minimax(newState, depth - 1, -Infinity, Infinity, false);
        if (value > bestValue) {
            bestValue = value;
            bestMove = move;
        }
    }
    return bestMove;
}
