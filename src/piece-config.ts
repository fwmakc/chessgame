import { GameState, Position, Move, Color, PieceType, PieceConfig } from './types.js';
import { isInsideBoard, getPiece, getSquareType } from './board.js';

let globalConfig: PieceConfig | null = null;

export async function loadPieceConfig(url: string): Promise<PieceConfig> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load piece config: ${res.status}`);
  const config: PieceConfig = await res.json();
  globalConfig = config;
  return config;
}

export function setPieceConfig(config: PieceConfig): void {
  globalConfig = config;
}

export function getPieceConfig(): PieceConfig {
  if (!globalConfig) throw new Error('Piece config not loaded');
  return globalConfig;
}

export function getConfigMoves(
  state: GameState,
  pos: Position,
  pieceType: PieceType,
  color: Color
): Move[] {
  const config = getPieceConfig();
  const typeConfig = config.pieceTypes[pieceType];
  if (!typeConfig) return [];

  const moves: Move[] = [];

  for (const behavior of typeConfig.behaviors) {
    if (!checkConditions(state, pos, color, behavior.conditions)) continue;

    for (const [dx, dyRaw] of behavior.vectors) {
      const dy = color === 'white' ? dyRaw : -dyRaw;

      if (behavior.slide) {
        if (behavior.jumpCapture) {
          // Sliding jump capture (e.g. checkers king)
          let r = pos.row + dy;
          let c = pos.col + dx;
          let foundEnemy = false;
          while (isInsideBoard(state, { row: r, col: c })) {
            const targetPos = { row: r, col: c };
            if (getSquareType(state, targetPos) === 'wall') break;
            const targetPiece = getPiece(state, targetPos);
            if (!targetPiece) {
              if (foundEnemy) {
                moves.push({ from: pos, to: targetPos, isCapture: true });
              }
            } else {
              if (!foundEnemy && targetPiece.color !== color) {
                foundEnemy = true;
              } else {
                break;
              }
            }
            r += dy;
            c += dx;
          }
        } else {
          // Normal sliding
          let r = pos.row + dy;
          let c = pos.col + dx;
          while (isInsideBoard(state, { row: r, col: c })) {
            const targetPos = { row: r, col: c };
            if (getSquareType(state, targetPos) === 'wall') break;
            const targetPiece = getPiece(state, targetPos);
            if (!targetPiece) {
              if (behavior.move) {
                moves.push({ from: pos, to: targetPos });
              }
            } else {
              if (targetPiece.color !== color && behavior.capture) {
                moves.push({ from: pos, to: targetPos, isCapture: true });
              }
              break;
            }
            r += dy;
            c += dx;
          }
        }
      } else {
        const targetPos = { row: pos.row + dy, col: pos.col + dx };
        if (!isInsideBoard(state, targetPos)) continue;
        if (getSquareType(state, targetPos) === 'wall') continue;

        if (behavior.conditions?.includes('clearPath')) {
          if (!isPathClear(state, pos, targetPos)) continue;
        }

        if (behavior.jumpCapture) {
          const midPos = { row: pos.row + dy / 2, col: pos.col + dx / 2 };
          if (!isInsideBoard(state, midPos)) continue;
          const targetPiece = getPiece(state, targetPos);
          const midPiece = getPiece(state, midPos);
          if (!targetPiece && midPiece && midPiece.color !== color) {
            moves.push({ from: pos, to: targetPos, isCapture: true });
          }
        } else {
          const targetPiece = getPiece(state, targetPos);
          if (!targetPiece) {
            if (behavior.move) {
              moves.push({ from: pos, to: targetPos });
            }
          } else if (targetPiece.color !== color && behavior.capture) {
            moves.push({ from: pos, to: targetPos, isCapture: true });
          }
        }
      }
    }
  }

  return moves;
}

function checkConditions(
  state: GameState,
  pos: Position,
  color: Color,
  conditions?: string[]
): boolean {
  if (!conditions) return true;
  for (const cond of conditions) {
    switch (cond) {
      case 'fromStartRank': {
        const startRow = color === 'white' ? state.height - 2 : 1;
        if (pos.row !== startRow) return false;
        break;
      }
      case 'clearPath':
      case 'multiCapture':
        // checked elsewhere
        break;
      default:
        break;
    }
  }
  return true;
}

function isPathClear(state: GameState, from: Position, to: Position): boolean {
  const dr = Math.sign(to.row - from.row);
  const dc = Math.sign(to.col - from.col);
  let r = from.row + dr;
  let c = from.col + dc;

  while (r !== to.row || c !== to.col) {
    const p = { row: r, col: c };
    if (!isInsideBoard(state, p)) return false;
    if (getSquareType(state, p) === 'wall') return false;
    if (getPiece(state, p)) return false;
    r += dr;
    c += dc;
  }

  return true;
}
