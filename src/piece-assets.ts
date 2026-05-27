import { Color, PieceType } from './types.js';

let piecesBasePath = 'assets/skins/default/pieces';

export function setPiecesBasePath(path: string): void {
  piecesBasePath = path;
}

export function getPiecePaths(): Record<Color, Record<PieceType, string>> {
  return {
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
}
