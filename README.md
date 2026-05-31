# Chessgame

Browser-based chess and board game engine with customizable skins, AI, and multiple game modes.

## Quick Start

```bash
# Install dependencies
yarn install

# Start dev server with hot reload
yarn dev
```

Then open http://localhost:5173 in your browser.

## Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start Vite dev server with HMR (port 5173) |
| `yarn build` | Type-check and build for production |
| `yarn preview` | Preview production build locally (port 4173) |
| `yarn clean` | Remove `dist/` |

## Project Structure

```
assets/
  games/          # Game configs (JSON)
  skins/          # Skins with pieces SVG + board.css
  board/          # Board background images
src/
  main.ts         # UI controller
  board.ts        # State creation & serialization
  moves.ts        # Move generation & rules
  game.ts         # Move execution & victory conditions
  ai.ts           # AI opponent
  piece-assets.ts # Piece image paths
  piece-config.ts # Piece behavior configs
  types.ts        # Type definitions
dist/             # Production build output
```

## Customizing Skins

Each skin lives in `assets/skins/{name}/`:

- `pieces/` — SVG files for each piece type and color
- `board.css` — CSS variables for board colors, square images, and state overlays

Update `assets/skins/index.json` to register new skins.
