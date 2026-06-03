export type Color = 'white' | 'black';
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king' | 'checker' | 'checkerKing';
export type SquareType = 'light' | 'dark' | 'wall';

export interface Piece {
  id: number;
  type: PieceType;
  color: Color;
}

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  promotion?: PieceType;
  isCapture?: boolean;
}

export interface CastlingRule {
  partnerType: PieceType;
  searchDirection: number;
  kingTarget: [number, number];
  partnerTarget: [number, number];
}

export interface PieceBehavior {
  vectors: [number, number][];
  slide: boolean;
  move: boolean;
  capture: boolean;
  jumpCapture?: boolean;
  conditions?: string[];
}

export interface PieceTypeConfig {
  behaviors: PieceBehavior[];
  special?: string[];
  castling?: CastlingRule[];
  promotionTarget?: PieceType;
  value?: number;
  mirrorH?: boolean;
  mirrorV?: boolean;
}

export interface PieceConfig {
  pieceTypes: Partial<Record<PieceType, PieceTypeConfig>>;
}

export interface LevelConfig {
  name: string;
  board: BoardConfig;
}

export interface GameConfig {
  name: string;
  victoryCondition: VictoryCondition;
  forcedCapture?: boolean;
  moveTimeLimit?: number; // seconds, 0 = no limit
  gameTimeLimit?: number; // minutes, 0 = no limit
  moveCountLimit?: number; // full moves, 0 = no limit
  levelSelect?: 'disabled' | 'select' | 'random';
  levels?: LevelConfig[];
  board: BoardConfig;
  pieces: PieceConfig;
}

export interface VictoryCondition {
  type: 'checkmate' | 'annihilation' | 'target' | 'visitedAll' | 'timeLimit';
  targetPiece?: PieceType;
}

export interface BoardConfig {
  name: string;
  width: number;
  height: number;
  squares: SquareType[][];
  initialPieces?: { type: PieceType; color: Color; row: number; col: number }[];
  victoryCondition?: VictoryCondition;
}

export interface GameState {
  board: (Piece | null)[][];
  squares: SquareType[][];
  width: number;
  height: number;
  turn: Color;
  victoryCondition: VictoryCondition;
  forcedCapture: boolean;
  moveTimeLimit: number;
  gameTimeLimit: number;
  moveCountLimit: number;
  gameTimedOut: boolean;
  pieceHasMoved: boolean[][];
  visitedSquares: boolean[][];
  pieceHistory: Map<number, boolean[][]>;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

export interface MoveResult {
  move: Move;
  captured: Piece | null;
  wasEnPassant: boolean;
  wasCastling: boolean;
  wasJumpCapture: boolean;
  rookMove?: Move;
  promotion?: PieceType;
}
