import { Color, PieceType, PiecePhase } from './types.js';

let piecesBasePath = 'assets/skins/default/pieces';

const piecePaths: Record<Color, Record<PieceType, string>> = {
  white: {
    king: `${piecesBasePath}/white-king.svg`,
    queen: `${piecesBasePath}/white-queen.svg`,
    rook: `${piecesBasePath}/white-rook.svg`,
    bishop: `${piecesBasePath}/white-bishop.svg`,
    knight: `${piecesBasePath}/white-knight.svg`,
    pawn: `${piecesBasePath}/white-pawn.svg`,
    checker: `${piecesBasePath}/white-checker.svg`,
    checkerKing: `${piecesBasePath}/white-checker-king.svg`,
  },
  black: {
    king: `${piecesBasePath}/black-king.svg`,
    queen: `${piecesBasePath}/black-queen.svg`,
    rook: `${piecesBasePath}/black-rook.svg`,
    bishop: `${piecesBasePath}/black-bishop.svg`,
    knight: `${piecesBasePath}/black-knight.svg`,
    pawn: `${piecesBasePath}/black-pawn.svg`,
    checker: `${piecesBasePath}/black-checker.svg`,
    checkerKing: `${piecesBasePath}/black-checker-king.svg`,
  },
};

export function setPiecesBasePath(path: string): void {
  piecesBasePath = path;
  piecePaths.white = {
    king: `${path}/white-king.svg`,
    queen: `${path}/white-queen.svg`,
    rook: `${path}/white-rook.svg`,
    bishop: `${path}/white-bishop.svg`,
    knight: `${path}/white-knight.svg`,
    pawn: `${path}/white-pawn.svg`,
    checker: `${path}/white-checker.svg`,
    checkerKing: `${path}/white-checker-king.svg`,
  };
  piecePaths.black = {
    king: `${path}/black-king.svg`,
    queen: `${path}/black-queen.svg`,
    rook: `${path}/black-rook.svg`,
    bishop: `${path}/black-bishop.svg`,
    knight: `${path}/black-knight.svg`,
    pawn: `${path}/black-pawn.svg`,
    checker: `${path}/black-checker.svg`,
    checkerKing: `${path}/black-checker-king.svg`,
  };
}

export function getPiecePath(color: Color, type: PieceType, phase: PiecePhase = 'default'): string {
  const base = piecePaths[color][type];
  if (phase === 'default') return base;
  return base.replace('.svg', `-${phase}.svg`);
}

export function getPiecePaths(): Record<Color, Record<PieceType, string>> {
  return piecePaths;
}
