# Board Assets

Place your custom board images here.

## Files

| File | Size | Description |
|------|------|-------------|
| `board-bg.png` | 480×480px (or any) | Full board background image. Shown behind all squares. |
| `dark-square.png` | 60×60px (tileable) | Texture for dark squares. Applied per-square. |
| `light-square.png` | 60×60px (tileable) | Texture for light squares. Applied per-square. |

## Labels / Notation (Rank & File)

If your `board-bg.png` includes rank numbers (1-8) and file letters (a-h) around
the edges, use the label variables in `assets/board.css` to align the 8×8 grid:

```css
:root {
  /* Make room for labels drawn on board-bg.png */
  --board-label-top: 0px;
  --board-label-right: 0px;
  --board-label-bottom: 24px;   /* letters a-h */
  --board-label-left: 24px;     /* numbers 1-8 */
}
```

The grid will automatically offset so squares line up with the playable area
inside your background image.

## Tips

- Use transparent PNG if you want the square colors to show through.
- Use `background-repeat: repeat` automatically — small tileable textures work great.
- SVG is also supported: just change the file extension and update `assets/board.css`.
- If you don't want a full board background, leave `--board-bg-image: none`.
- If you don't want square textures, leave `--board-dark-image: none` and `--board-light-image: none`.
- If you don't want labels, leave all `--board-label-*` values at `0px`.
