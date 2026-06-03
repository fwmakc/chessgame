import { GameState, Move, Color, PieceType, Position, Piece } from './types.js';
import { cloneState, getPiece, setPiece } from './board.js';
import { getAllLegalMoves, getPseudoLegalMoves } from './moves.js';
import { makeMove, isVictory } from './game.js';
import { getPieceConfig } from './piece-config.js';

const DEFAULT_PIECE_VALUES: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
  checker: 150,
  checkerKing: 400,
};

export function getPieceValue(type: PieceType): number {
  const config = getPieceConfig();
  const typeConfig = config.pieceTypes[type];
  if (typeConfig?.value !== undefined) {
    return typeConfig.value;
  }
  return DEFAULT_PIECE_VALUES[type] ?? 0;
}

// ---------- Attack Map ----------

interface AttackerInfo {
  piece: Piece;
  from: Position;
  value: number;
}

type SquareAttackers = AttackerInfo[] | undefined;

interface AttackMap {
  white: SquareAttackers[][];
  black: SquareAttackers[][];
}

function buildAttackMap(state: GameState): AttackMap {
  const emptyRow: SquareAttackers[] = Array.from({ length: state.width }, () => undefined);
  const map: AttackMap = {
    white: Array.from({ length: state.height }, () => emptyRow.slice()),
    black: Array.from({ length: state.height }, () => emptyRow.slice()),
  };

  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const piece = state.board[row][col];
      if (!piece) continue;

      const moves = getPseudoLegalMoves(state, { row, col });
      const isPawn = piece.type === 'pawn';

      for (const move of moves) {
        if (isPawn && !move.isCapture) continue;
        if (piece.type === 'king' && Math.abs(move.to.col - move.from.col) > 1) continue;

        const list = map[piece.color][move.to.row][move.to.col];
        const info: AttackerInfo = {
          piece,
          from: { row, col },
          value: getPieceValue(piece.type),
        };
        if (list) {
          list.push(info);
        } else {
          map[piece.color][move.to.row][move.to.col] = [info];
        }
      }
    }
  }

  return map;
}

function getAttackers(map: AttackMap, square: Position, color: Color): AttackerInfo[] {
  return map[color][square.row][square.col] ?? [];
}

// ---------- SEE (Static Exchange Evaluation) ----------

function see(state: GameState, square: Position, attackingColor: Color, depth: number = 0): number {
  if (depth > 10) return 0;

  let bestAttacker: AttackerInfo | null = null;

  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== attackingColor) continue;

      const moves = getPseudoLegalMoves(state, { row, col });
      const isPawn = piece.type === 'pawn';

      const canAttack = moves.some(m => {
        if (isPawn && !m.isCapture) return false;
        if (piece.type === 'king' && Math.abs(m.to.col - m.from.col) > 1) return false;
        return m.to.row === square.row && m.to.col === square.col;
      });

      if (canAttack) {
        const val = getPieceValue(piece.type);
        if (!bestAttacker || val < bestAttacker.value) {
          bestAttacker = { piece, from: { row, col }, value: val };
        }
      }
    }
  }

  if (!bestAttacker) return 0;

  const capturedPiece = getPiece(state, square);
  if (!capturedPiece) return 0;

  const capturedValue = getPieceValue(capturedPiece.type);

  const newState = cloneState(state);
  setPiece(newState, bestAttacker.from, null);
  setPiece(newState, square, bestAttacker.piece);

  const recursiveValue = see(newState, square, attackingColor === 'white' ? 'black' : 'white', depth + 1);

  return capturedValue - recursiveValue;
}

// ---------- Evaluation ----------

function evaluateState(state: GameState): number {
  let whiteMaterial = 0;
  let blackMaterial = 0;
  let whiteHanging = 0;
  let blackHanging = 0;

  const attackMap = buildAttackMap(state);

  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const piece = state.board[row][col];
      if (!piece) continue;

      const value = getPieceValue(piece.type);
      if (piece.color === 'white') whiteMaterial += value;
      else blackMaterial += value;

      const enemyColor = piece.color === 'white' ? 'black' : 'white';
      const attackers = getAttackers(attackMap, { row, col }, enemyColor);
      const defenders = getAttackers(attackMap, { row, col }, piece.color);

      if (attackers.length > 0 && defenders.length === 0) {
        if (piece.color === 'white') whiteHanging += value;
        else blackHanging += value;
      }
    }
  }

  const whiteMoves = getAllLegalMoves(state, 'white').length;
  const blackMoves = getAllLegalMoves(state, 'black').length;

  const materialScore = whiteMaterial - blackMaterial;
  const hangingScore = -(whiteHanging - blackHanging) * 0.8;
  const mobilityScore = (whiteMoves - blackMoves) * 10;

  const score = materialScore + hangingScore + mobilityScore;
  return state.turn === 'white' ? score : -score;
}

// ---------- Quiescence Search ----------

function quiescence(state: GameState, alpha: number, beta: number, qDepth: number = 0): number {
  const standPat = evaluateState(state);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  if (qDepth > 10) return alpha;

  const moves = getAllLegalMoves(state, state.turn);
  const captures = moves.filter(m => state.board[m.to.row][m.to.col] !== null);

  const ordered = sortMoves(state, captures);

  for (const move of ordered) {
    const newState = cloneState(state);
    makeMove(newState, move);
    const score = -quiescence(newState, -beta, -alpha, qDepth + 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

// ---------- Move Ordering ----------

function scoreMove(state: GameState, move: Move): number {
  const targetPiece = state.board[move.to.row][move.to.col];
  if (targetPiece) {
    const seeValue = see(state, move.to, state.turn);
    if (seeValue > 0) return 1000000 + seeValue;
    if (seeValue === 0) return 500000;
    return -500000 + seeValue;
  }
  return 0;
}

function sortMoves(state: GameState, moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => scoreMove(state, b) - scoreMove(state, a));
}

// ---------- Minimax ----------

function minimax(state: GameState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) {
    return quiescence(state, alpha, beta);
  }

  const moves = getAllLegalMoves(state, state.turn);
  if (moves.length === 0) {
    if (isVictory(state)) {
      return -100000 + depth;
    }
    return 0;
  }

  const sortedMoves = sortMoves(state, moves);

  for (const move of sortedMoves) {
    const newState = cloneState(state);
    makeMove(newState, move);
    const evalScore = -minimax(newState, depth - 1, -beta, -alpha);
    if (evalScore >= beta) return beta;
    if (evalScore > alpha) alpha = evalScore;
  }

  return alpha;
}

// ---------- Public API ----------

export function findBestMove(state: GameState, depth: number = 4): Move | null {
  const moves = getAllLegalMoves(state, state.turn);
  if (moves.length === 0) return null;

  const sortedMoves = sortMoves(state, moves);
  let bestMove = sortedMoves[0];
  let bestValue = -Infinity;

  for (const move of sortedMoves) {
    const newState = cloneState(state);
    makeMove(newState, move);
    const value = -minimax(newState, depth - 1, -Infinity, Infinity);
    if (value > bestValue) {
      bestValue = value;
      bestMove = move;
    }
  }

  return bestMove;
}
