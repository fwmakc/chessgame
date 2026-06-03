import { Piece, Color, PieceType, Position, GameState, BoardConfig, SquareType, GameConfig } from './types.js';

export async function loadBoardConfig(url: string): Promise<BoardConfig> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load board config: ${res.status}`);
  return res.json();
}

export async function loadGameConfig(url: string): Promise<GameConfig> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load game config: ${res.status}`);
  return res.json();
}

function getDefaultInitialPieces(height: number): { type: PieceType; color: Color; row: number; col: number }[] {
  const backRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
  const pieces: { type: PieceType; color: Color; row: number; col: number }[] = [];

  for (let col = 0; col < 8 && col < backRow.length; col++) {
    pieces.push({ type: backRow[col], color: 'black', row: 0, col });
    pieces.push({ type: 'pawn', color: 'black', row: 1, col });
  }

  const whitePawnRow = height - 2;
  const whiteBackRow = height - 1;
  for (let col = 0; col < 8 && col < backRow.length; col++) {
    pieces.push({ type: 'pawn', color: 'white', row: whitePawnRow, col });
    pieces.push({ type: backRow[col], color: 'white', row: whiteBackRow, col });
  }

  return pieces;
}

export function createInitialState(config?: BoardConfig): GameState {
  const width = config?.width ?? 8;
  const height = config?.height ?? 8;

  const squares: SquareType[][] = config?.squares ?? Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => ((r + c) % 2 === 0 ? 'light' : 'dark'))
  );

  const board: (Piece | null)[][] = Array.from({ length: height }, () => Array(width).fill(null));
  const visitedSquares: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const pieceHistory = new Map<number, boolean[][]>();
  let nextId = 1;

  const initialPieces = config?.initialPieces ?? getDefaultInitialPieces(height);
  for (const p of initialPieces) {
    if (p.row >= 0 && p.row < height && p.col >= 0 && p.col < width && squares[p.row][p.col] !== 'wall') {
      const piece: Piece = { id: nextId++, type: p.type, color: p.color };
      board[p.row][p.col] = piece;
      visitedSquares[p.row][p.col] = true;
      const history = Array.from({ length: height }, () => Array(width).fill(false));
      history[p.row][p.col] = true;
      pieceHistory.set(piece.id, history);
    }
  }

  return {
    board,
    squares,
    width,
    height,
    turn: 'white',
    victoryCondition: config?.victoryCondition ?? { type: 'checkmate', targetPiece: 'king' },
    forcedCapture: false,
    moveTimeLimit: 0,
    gameTimeLimit: 0,
    moveCountLimit: 0,
    gameTimedOut: false,
    pieceHasMoved: Array.from({ length: height }, () => Array(width).fill(false)),
    visitedSquares,
    pieceHistory,
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

export function cloneBoard(board: (Piece | null)[][]): (Piece | null)[][] {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

export function cloneState(state: GameState): GameState {
  return {
    board: cloneBoard(state.board),
    squares: state.squares.map(row => [...row]),
    width: state.width,
    height: state.height,
    turn: state.turn,
    pieceHasMoved: state.pieceHasMoved.map(row => [...row]),
    visitedSquares: state.visitedSquares.map(row => [...row]),
    pieceHistory: new Map(
      Array.from(state.pieceHistory.entries()).map(([id, grid]) => [id, grid.map(row => [...row])])
    ),
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    victoryCondition: state.victoryCondition,
    forcedCapture: state.forcedCapture,
    moveTimeLimit: state.moveTimeLimit,
    gameTimeLimit: state.gameTimeLimit,
    moveCountLimit: state.moveCountLimit,
    gameTimedOut: state.gameTimedOut,
  };
}

export function serializeState(state: GameState): any {
  return {
    board: state.board,
    squares: state.squares,
    width: state.width,
    height: state.height,
    turn: state.turn,
    pieceHasMoved: state.pieceHasMoved,
    visitedSquares: state.visitedSquares,
    pieceHistory: Object.fromEntries(state.pieceHistory),
    enPassantTarget: state.enPassantTarget,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    victoryCondition: state.victoryCondition,
    forcedCapture: state.forcedCapture,
    moveTimeLimit: state.moveTimeLimit,
    gameTimeLimit: state.gameTimeLimit,
    moveCountLimit: state.moveCountLimit,
    gameTimedOut: state.gameTimedOut,
  };
}

export function deserializeState(data: any): GameState {
  return {
    board: data.board,
    squares: data.squares,
    width: data.width,
    height: data.height,
    turn: data.turn,
    pieceHasMoved: data.pieceHasMoved,
    visitedSquares: data.visitedSquares,
    pieceHistory: new Map(
      Object.entries(data.pieceHistory).map(([k, v]) => [Number(k), v as boolean[][]])
    ),
    enPassantTarget: data.enPassantTarget,
    halfmoveClock: data.halfmoveClock,
    fullmoveNumber: data.fullmoveNumber,
    victoryCondition: data.victoryCondition,
    forcedCapture: data.forcedCapture,
    moveTimeLimit: data.moveTimeLimit,
    gameTimeLimit: data.gameTimeLimit,
    moveCountLimit: data.moveCountLimit ?? 0,
    gameTimedOut: data.gameTimedOut,
  };
}

export function isInsideBoard(state: GameState, pos: Position): boolean {
  return pos.row >= 0 && pos.row < state.height && pos.col >= 0 && pos.col < state.width;
}

export function getPiece(state: GameState, pos: Position): Piece | null {
  if (!isInsideBoard(state, pos)) return null;
  return state.board[pos.row][pos.col];
}

export function getSquareType(state: GameState, pos: Position): SquareType | null {
  if (!isInsideBoard(state, pos)) return null;
  return state.squares[pos.row][pos.col];
}

export function setPiece(state: GameState, pos: Position, piece: Piece | null): void {
  if (!isInsideBoard(state, pos)) return;
  state.board[pos.row][pos.col] = piece;
}

export function posToString(pos: Position, height: number = 8): string {
  const files = 'abcdefghijklmnopqrstuvwxyz';
  return files[pos.col] + (height - pos.row);
}

export function stringToPos(s: string, height: number = 8): Position {
  const files = 'abcdefghijklmnopqrstuvwxyz';
  return {
    col: files.indexOf(s[0]),
    row: parseInt(s.slice(1)) - 1,
  };
}
