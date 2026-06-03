import { Position, Move, Color, GameState, PieceType } from './types.js';
import { isInsideBoard, getPiece, setPiece, cloneState, getSquareType } from './board.js';
import { getPieceConfig, getConfigMoves } from './piece-config.js';

export function getPseudoLegalMoves(state: GameState, pos: Position): Move[] {
  const piece = getPiece(state, pos);
  if (!piece) return [];

  const moves = getConfigMoves(state, pos, piece.type, piece.color);

  const config = getPieceConfig();
  const typeConfig = config.pieceTypes[piece.type];
  if (!typeConfig) return moves;

  // En passant
  if (typeConfig.special?.includes('enPassant')) {
    const epMoves = getEnPassantMoves(state, pos, piece.color);
    moves.push(...epMoves);
  }

  // Castling
  if (typeConfig.special?.includes('castling') && typeConfig.castling) {
    const castlingMoves = getCastlingMoves(state, pos, piece.color, typeConfig.castling);
    moves.push(...castlingMoves);
  }

  return moves;
}

function getEnPassantMoves(state: GameState, pos: Position, color: Color): Move[] {
  const moves: Move[] = [];
  if (!state.enPassantTarget) return moves;

  const direction = color === 'white' ? -1 : 1;
  for (const dc of [-1, 1]) {
    const capturePos = { row: pos.row + direction, col: pos.col + dc };
    if (
      isInsideBoard(state, capturePos) &&
      state.enPassantTarget.row === capturePos.row &&
      state.enPassantTarget.col === capturePos.col
    ) {
      moves.push({ from: pos, to: capturePos, isCapture: true });
    }
  }
  return moves;
}

function getCastlingMoves(
  state: GameState,
  pos: Position,
  color: Color,
  rules: { partnerType: PieceType; searchDirection: number; kingTarget: [number, number]; partnerTarget: [number, number] }[]
): Move[] {
  const moves: Move[] = [];
  const enemyColor = color === 'white' ? 'black' : 'white';

  for (const rule of rules) {
    // Check king hasn't moved
    if (state.pieceHasMoved[pos.row][pos.col]) continue;

    // Search for partner piece
    let searchCol = pos.col + rule.searchDirection;
    let foundPartner: Position | null = null;
    while (isInsideBoard(state, { row: pos.row, col: searchCol })) {
      const sq = { row: pos.row, col: searchCol };
      const piece = getPiece(state, sq);
      if (piece) {
        if (piece.type === rule.partnerType && piece.color === color && !state.pieceHasMoved[sq.row][sq.col]) {
          foundPartner = sq;
        }
        break;
      }
      searchCol += rule.searchDirection;
    }
    if (!foundPartner) continue;

    // Check path between king and partner is clear (excluding partner itself)
    const step = rule.searchDirection;
    let clear = true;
    for (let c = pos.col + step; c !== foundPartner.col; c += step) {
      const sq = { row: pos.row, col: c };
      if (getPiece(state, sq) || getSquareType(state, sq) === 'wall') {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    // Calculate king destination
    const kingDy = color === 'white' ? rule.kingTarget[1] : -rule.kingTarget[1];
    const kingTo = { row: pos.row + kingDy, col: pos.col + rule.kingTarget[0] };
    if (!isInsideBoard(state, kingTo)) continue;

    // Check king not in check, doesn't pass through check, doesn't land in check
    if (isSquareAttacked(state, pos, enemyColor)) continue;

    const midCol = pos.col + step;
    if (isSquareAttacked(state, { row: pos.row, col: midCol }, enemyColor)) continue;
    if (isSquareAttacked(state, kingTo, enemyColor)) continue;

    moves.push({ from: pos, to: kingTo });
  }

  return moves;
}

export function isSquareAttacked(state: GameState, pos: Position, byColor: Color): boolean {
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const piece = state.board[row][col];
      if (piece && piece.color === byColor) {
        const moves = getPseudoLegalMoves(state, { row, col });
        // Pawns only attack diagonally, not straight forward
        const isPawn = piece.type === 'pawn';
        if (moves.some(m => {
          if (isPawn && !m.isCapture) return false;
          return m.to.row === pos.row && m.to.col === pos.col;
        })) {
          return true;
        }
      }
    }
  }
  return false;
}

export function findKing(state: GameState, color: Color): Position | null {
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const piece = state.board[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

export function isInCheck(state: GameState, color: Color): boolean {
  const kingPos = findKing(state, color);
  if (!kingPos) return false;
  return isSquareAttacked(state, kingPos, color === 'white' ? 'black' : 'white');
}

export function getLegalMoves(state: GameState, pos: Position): Move[] {
  const pseudoLegal = getPseudoLegalMoves(state, pos);
  const legal: Move[] = [];
  const piece = getPiece(state, pos);
  if (!piece) return [];

  const config = getPieceConfig();
  const typeConfig = config.pieceTypes[piece.type];
  const isVulnerable = typeConfig?.special?.includes('vulnerable') ?? false;
  const enemyColor = piece.color === 'white' ? 'black' : 'white';

  // Auto-promotion via config
  if (typeConfig?.promotionTarget && typeConfig?.special?.includes('promotion')) {
    for (const move of pseudoLegal) {
      if (move.to.row === 0 || move.to.row === state.height - 1) {
        move.promotion = typeConfig.promotionTarget;
      }
    }
  }

  // Promotion for pieces without fixed promotionTarget (chess pawns)
  if (typeConfig?.special?.includes('promotion') && !typeConfig?.promotionTarget) {
    const promotionTypes: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
    const expanded: Move[] = [];
    for (const move of pseudoLegal) {
      if (move.to.row === 0 || move.to.row === state.height - 1) {
        for (const promo of promotionTypes) {
          expanded.push({ ...move, promotion: promo });
        }
      } else {
        expanded.push(move);
      }
    }
    pseudoLegal.length = 0;
    pseudoLegal.push(...expanded);
  }

  for (const move of pseudoLegal) {
    // Vulnerable pieces cannot move to attacked squares
    if (isVulnerable && isSquareAttacked(state, move.to, enemyColor)) {
      continue;
    }

    // noRevisit: cannot move to globally visited squares
    if (typeConfig?.special?.includes('noRevisit') && state.visitedSquares[move.to.row][move.to.col]) {
      continue;
    }

    // noRevisitPersonal: cannot move to squares this specific piece has visited
    if (typeConfig?.special?.includes('noRevisitPersonal')) {
      const history = state.pieceHistory.get(piece.id);
      if (history && history[move.to.row][move.to.col]) {
        continue;
      }
    }

    const testState = cloneState(state);
    const testPiece = getPiece(testState, move.from);
    if (!testPiece) continue;

    setPiece(testState, move.to, testPiece);
    setPiece(testState, move.from, null);

    // En passant capture
    if (typeConfig?.special?.includes('enPassant') && testState.enPassantTarget &&
        move.to.row === testState.enPassantTarget.row &&
        move.to.col === testState.enPassantTarget.col &&
        move.from.col !== move.to.col) {
      const capturedPawnRow = testPiece.color === 'white' ? move.to.row + 1 : move.to.row - 1;
      setPiece(testState, { row: capturedPawnRow, col: move.to.col }, null);
    }

    // Promotion
    if (move.promotion) {
      setPiece(testState, move.to, { id: testPiece.id, type: move.promotion, color: testPiece.color });
    }

    // Castling partner move
    if (typeConfig?.special?.includes('castling') && typeConfig.castling) {
      const kingDy = move.to.row - move.from.row;
      const kingDx = move.to.col - move.from.col;
      for (const rule of typeConfig.castling) {
        const expectedDy = testPiece.color === 'white' ? rule.kingTarget[1] : -rule.kingTarget[1];
        if (kingDx === rule.kingTarget[0] && kingDy === expectedDy) {
          const partnerCol = move.to.col + rule.partnerTarget[0];
          const partnerRow = move.to.row + (testPiece.color === 'white' ? rule.partnerTarget[1] : -rule.partnerTarget[1]);
          // Find partner and move it
          const searchDir = -rule.searchDirection;
          let c = move.to.col + searchDir;
          while (isInsideBoard(testState, { row: move.to.row, col: c })) {
            const p = getPiece(testState, { row: move.to.row, col: c });
            if (p && p.type === rule.partnerType && p.color === testPiece.color) {
              setPiece(testState, { row: partnerRow, col: partnerCol }, p);
              setPiece(testState, { row: move.to.row, col: c }, null);
              break;
            }
            c += searchDir;
          }
          break;
        }
      }
    }

    if (!isInCheck(testState, testPiece.color)) {
      legal.push(move);
    }
  }

  return legal;
}

export function getAllLegalMoves(state: GameState, color: Color): Move[] {
  const moves: Move[] = [];
  for (let row = 0; row < state.height; row++) {
    for (let col = 0; col < state.width; col++) {
      const piece = state.board[row][col];
      if (piece && piece.color === color) {
        moves.push(...getLegalMoves(state, { row, col }));
      }
    }
  }
  // Forced capture: if any capture is available, only captures are allowed
  if (state.forcedCapture) {
    const captures = moves.filter(m => m.isCapture);
    if (captures.length > 0) {
      return captures;
    }
  }
  return moves;
}
