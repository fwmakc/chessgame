# Piece Configuration

This file defines how every piece type moves, captures, and interacts with the board.

## File Location

`assets/piece-config.json`

## Top-Level Structure

```json
{
  "pieceTypes": {
    "bishop": { ... },
    "knight": { ... },
    "rook":   { ... },
    "queen":  { ... },
    "king":   { ... },
    "pawn":   { ... }
  }
}
```

Each key under `pieceTypes` is a `PieceType`: `pawn`, `rook`, `knight`, `bishop`, `queen`, `king`.
You can also add custom types (e.g. `checker`, `checkerKing`) as long as the engine knows how to render them.

## Piece Type Object

```json
{
  "behaviors": [ ... ],
  "special": ["castling"],
  "castling": [ ... ]
}
```

### `behaviors`

An array of movement rules. Every behavior is evaluated independently and its resulting moves are merged.

```json
{
  "vectors": [[1, 0], [-1, 0], [0, 1], [0, -1]],
  "slide": true,
  "move": true,
  "capture": true,
  "jumpCapture": false,
  "conditions": ["fromStartRank"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `vectors` | `[[dx, dy], ...]` | List of direction vectors. Positive `dy` means "forward" for the piece's owner in the config; the engine automatically flips `dy` for black pieces. |
| `slide` | `boolean` | `true` — repeat the vector until blocked (rook, bishop, queen). `false` — single jump only (knight, king, pawn, checker). |
| `move` | `boolean` | Allowed to land on an **empty** square. |
| `capture` | `boolean` | Allowed to land on a square occupied by an **enemy** piece. |
| `jumpCapture` | `boolean` | Allowed to jump over an adjacent enemy and land on the empty square behind it. See below. |
| `conditions` | `string[]` | Optional modifiers (see below). |

### `jumpCapture`

When `jumpCapture: true`, the move works differently:

- **Non-sliding (`slide: false`)**: the vector length must be even (e.g. `[2,-2]`). The engine checks the square exactly halfway (`mid = (from + to) / 2`). If `mid` holds an enemy piece and `to` is empty, the enemy is captured and the move is legal.
- **Sliding (`slide: true`)**: the piece slides along the vector until it meets an enemy. It may then land on any empty square beyond that enemy (until blocked by a wall, own piece, or board edge). The first enemy on the path is removed.

Example — checker (non-sliding):
```json
{
  "vectors": [[2, -2], [-2, -2]],
  "slide": false,
  "move": true,
  "capture": false,
  "jumpCapture": true
}
```

Example — checkers king (sliding):
```json
{
  "vectors": [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  "slide": true,
  "move": true,
  "capture": false,
  "jumpCapture": true
}
```

### `conditions`

| Condition | Applies to | Effect |
|-----------|-----------|--------|
| `fromStartRank` | Any piece | The move is only legal if the piece is still on its starting row (row 1 for black pawns, row `height-2` for white pawns). |
| `clearPath` | Non-sliding only | All intermediate squares between start and destination must be empty and not walls. Used for the pawn's double-step. |
| `multiCapture` | `jumpCapture` only | After a successful jump capture, if further jump captures are available from the landing square, the same player must continue. The turn does not pass until no more jumps are possible. |

### `special`

An optional array of strings for moves or rules that cannot be expressed as simple vectors:

| Special | Piece | Effect |
|---------|-------|--------|
| `castling` | King | Adds castling moves (kingside / queenside) when legal. Requires `castling` array in the same object. |
| `enPassant` | Pawn | Enables en-passant capture logic. |
| `promotion` | Pawn / Checker | When the piece reaches the final rank, it must promote. |
| `vulnerable` | Any | The piece cannot move to a square that is currently attacked by the enemy (like a king in standard chess). |
| `noRevisit` | Any | The piece cannot move to a square that has been visited by **any** piece during the game (global history). |
| `noRevisitPersonal` | Any | The piece cannot move to a square that **itself** has visited before (personal history). |

### `castling`

Required when `special` includes `"castling"`. Defines custom castling rules.

```json
{
  "castling": [
    {
      "partnerType": "rook",
      "searchDirection": 1,
      "kingTarget": [0, 2],
      "partnerTarget": [0, -1]
    },
    {
      "partnerType": "rook",
      "searchDirection": -1,
      "kingTarget": [0, -2],
      "partnerTarget": [0, 1]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `partnerType` | `PieceType` | Type of the piece to castle with (`rook`, `queen`, etc.). |
| `searchDirection` | `number` | `1` = search to the right of the king, `-1` = search to the left. |
| `kingTarget` | `[dx, dy]` | Where the king moves relative to its current position. |
| `partnerTarget` | `[dx, dy]` | Where the partner piece ends up relative to the **king's new** position. |

**How it works:**
1. The engine searches from the king in `searchDirection` until it finds the first piece of `partnerType` and the same color.
2. It verifies that neither the king nor that partner has ever moved (`pieceHasMoved` must be `false`).
3. It verifies that all squares between the king and the partner are empty and not walls.
4. It verifies that the king is not in check, does not pass through a checked square, and does not land on a checked square.
5. If all checks pass, the king may castle.

### Visited Squares History

The engine tracks two independent histories:

1. **`visitedSquares`** — global. Any square that has ever held any piece is marked. Used by `"noRevisit"`.
2. **`pieceHistory`** — personal. Every piece has its own `boolean[][]` grid tracking only the squares it has stood on. Used by `"noRevisitPersonal"`.

Both histories include the starting positions of all pieces.

## Coordinate System

All `vectors` are written from **White's perspective**:
- `dy: -1` = one row toward the top of the board (forward for White)
- `dy: +1` = one row toward the bottom (forward for Black, after automatic flip)
- `dx: +1` = one column to the right
- `dx: -1` = one column to the left

The engine automatically multiplies `dy` by `-1` for black pieces, so a pawn config of `[0, -1]` moves White pawns up and Black pawns down.

## Examples

### Standard Bishop
```json
{
  "behaviors": [
    {
      "vectors": [[1, 1], [1, -1], [-1, 1], [-1, -1]],
      "slide": true,
      "move": true,
      "capture": true
    }
  ]
}
```

### Standard King (with castling and vulnerable)
```json
{
  "behaviors": [
    {
      "vectors": [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]],
      "slide": false,
      "move": true,
      "capture": true
    }
  ],
  "special": ["castling", "vulnerable"],
  "castling": [
    { "partnerType": "rook", "searchDirection": 1, "kingTarget": [0, 2], "partnerTarget": [0, -1] },
    { "partnerType": "rook", "searchDirection": -1, "kingTarget": [0, -2], "partnerTarget": [0, 1] }
  ]
}
```

### Standard Pawn
```json
{
  "behaviors": [
    { "vectors": [[0, -1]], "slide": false, "move": true, "capture": false },
    { "vectors": [[0, -2]], "slide": false, "move": true, "capture": false, "conditions": ["fromStartRank", "clearPath"] },
    { "vectors": [[1, -1], [-1, -1]], "slide": false, "move": false, "capture": true }
  ],
  "special": ["enPassant", "promotion"]
}
```

### Checker (Russian Draughts piece)
```json
{
  "behaviors": [
    { "vectors": [[1, -1], [-1, -1]], "slide": false, "move": true, "capture": false },
    { "vectors": [[2, -2], [-2, -2]], "slide": false, "move": true, "capture": false, "jumpCapture": true, "conditions": ["multiCapture"] }
  ],
  "special": ["promotion"]
}
```

### Checkers King (damka)
```json
{
  "behaviors": [
    { "vectors": [[1, 1], [1, -1], [-1, 1], [-1, -1]], "slide": true, "move": true, "capture": false },
    { "vectors": [[1, 1], [1, -1], [-1, 1], [-1, -1]], "slide": true, "move": true, "capture": false, "jumpCapture": true, "conditions": ["multiCapture"] }
  ]
}
```

### Berolina Pawn (moves diagonally, captures straight)
```json
{
  "behaviors": [
    { "vectors": [[1, -1], [-1, -1]], "slide": false, "move": true, "capture": false },
    { "vectors": [[0, -1]], "slide": false, "move": false, "capture": true }
  ],
  "special": ["promotion"]
}
```

### Knight's Tour (single knight, no revisiting)
```json
{
  "pieceTypes": {
    "knight": {
      "behaviors": [
        {
          "vectors": [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
          "slide": false,
          "move": true,
          "capture": false
        }
      ],
      "special": ["noRevisit"]
    }
  }
}
```

### Custom "Archbishop" (Knight + Bishop)
```json
{
  "behaviors": [
    { "vectors": [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]], "slide": false, "move": true, "capture": true },
    { "vectors": [[1, 1], [1, -1], [-1, 1], [-1, -1]], "slide": true, "move": true, "capture": true }
  ]
}
```

### "Vulnerable Queen" (moves like a queen but cannot step into attacked squares)
```json
{
  "behaviors": [
    {
      "vectors": [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
      "slide": true,
      "move": true,
      "capture": true
    }
  ],
  "special": ["vulnerable"]
}
```
