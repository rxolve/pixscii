# pixscii

**LLMs can't draw. This MCP can.** A pixel art creation toolkit for AI agents.

Sister project of [artscii](https://github.com/rxolve/artscii). While artscii provides terminal ASCII art, pixscii gives AI agents a full pixel art workbench — draw, inspect, fix, compose, and export PNGs. Offline, deterministic, zero latency.

## What's New in v0.2

pixscii is no longer just a sprite viewer. The agent can now **create pixel art from scratch**.

```
create 16x16 → rect for outline → fill body → pixel for eyes → inspect → fix → export PNG
```

The core loop: **draw → inspect → correct → export**. The LLM becomes the artist.

## Quick Start

```bash
npx pixscii
```

Or add to your MCP client config:

```json
{
  "mcpServers": {
    "pixscii": {
      "command": "npx",
      "args": ["-y", "pixscii"]
    }
  }
}
```

## Tools (16)

### Source — Create or load a canvas

| Tool | Description |
|------|-------------|
| `create` | New blank canvas with optional fill color |
| `get` | Load a bundled sprite into an editable canvas |
| `character` | Generate a procedural RPG character |
| `convert` | Quantize any image (URL or base64) to pixel art |
| `search` | Browse the sprite library |

### Mutate — Draw on a canvas

| Tool | Description |
|------|-------------|
| `pixel` | Set individual pixels (batch up to 512) |
| `line` | Bresenham line between two points |
| `rect` | Rectangle — outline or filled |
| `fill` | Flood fill from a point (with leak detection) |
| `mirror` | Mirror left half to right half |
| `undo` | Revert the last drawing operation |

### Observe — Read the canvas state

| Tool | Description |
|------|-------------|
| `inspect` | View the canvas as a hex character grid |

### Compose & Output

| Tool | Description |
|------|-------------|
| `compose` | Layer multiple canvases/sprites into a scene |
| `tilemap` | Build a map from a tile grid |
| `animate` | Animate a sprite with pixel motion |
| `export` | Render a canvas to scaled PNG |

## The Hex Grid Protocol

Every pixel is one character. The agent reads and writes in the same alphabet:

```
0-F = PICO-8 palette colors (0=black, 7=white, 8=red, ...)
.   = transparent
```

When the agent calls `inspect`, it sees the canvas as text:

```
id: cvs-a3f2-001
size: 16x16 | palette: pico8 | non-transparent: 78/256
colors: 1=32 7=8 8=30 2=8

     0123456789ABCDEF
  0: ................
  1: .....111111.....
  2: .....177771.....
  3: .....177771.....
  4: ...1111111111...
  5: ...1888888881...
  6: ...1788888881...
  7: ...1788888881...
  8: ...1888888881...
  9: ...1888888281...
  A: ...1888882281...
  B: ...1888822281...
  C: ...1888888881...
  D: ...1111111111...
  E: ................
  F: ................
```

One char per pixel. Hex row/column headers for coordinate lookup. The LLM reads this like source code and reasons about it spatially.

## Example: Drawing a Health Potion from Scratch

```
Agent: I'll draw a 16x16 health potion.

→ create  { width: 16, height: 16, fill: "." }
← canvas_id: cvs-a3f2-001 (blank grid)

→ rect    { canvas_id: "cvs-a3f2-001", x: 3, y: 5, w: 10, h: 9, color: "1" }
← Rect outline at (3,5) 10x9.

→ rect    { canvas_id: "cvs-a3f2-001", x: 5, y: 1, w: 6, h: 4, color: "1" }
← Rect outline at (5,1) 6x4.

→ fill    { canvas_id: "cvs-a3f2-001", x: 7, y: 7, color: "8" }
← filled: 56 pixels, leaked: false (grid returned — agent verifies)

→ rect    { canvas_id: "cvs-a3f2-001", x: 6, y: 2, w: 4, h: 2, color: "7", filled: true }
← Rect filled at (6,2) 4x2. (white cork)

→ line    { canvas_id: "cvs-a3f2-001", x1: 5, y1: 7, x2: 5, y2: 11, color: "7" }
← Line drawn from (5,7) to (5,11). (glass highlight)

→ inspect { canvas_id: "cvs-a3f2-001" }
← (agent reads grid, spots a stray pixel at row 4)

→ pixel   { canvas_id: "cvs-a3f2-001", pixels: [{ x: 5, y: 4, color: "1" }] }
← 1 pixel(s) set.

→ export  { canvas_id: "cvs-a3f2-001", scale: 4 }
← 64x64 PNG returned.
```

## Example: Convert and Clean Up a Logo

```
→ convert { source: "https://example.com/logo.png", width: 32, height: 32 }
← canvas_id: cvs-b1c4-002 (grid shows quantized result — background is muddy)

→ fill    { canvas_id: "cvs-b1c4-002", x: 0, y: 0, color: "." }
← filled: 410 pixels, leaked: false (background cleared to transparent)

→ pixel   { canvas_id: "cvs-b1c4-002", pixels: [
    { x: 14, y: 10, color: "0" },
    { x: 17, y: 10, color: "0" }
  ]}
← 2 pixel(s) set. (eyes fixed to pure black)

→ mirror  { canvas_id: "cvs-b1c4-002" }
← (grid returned — face is now perfectly symmetric)

→ export  { canvas_id: "cvs-b1c4-002", scale: 4 }
← 128x128 PNG returned.
```

## Example: Build a Dungeon Scene

```
→ create  { width: 16, height: 16, fill: "4" }
← canvas_id: cvs-c2d5-003 (brown floor tile)

→ pixel   { canvas_id: "cvs-c2d5-003", pixels: [
    { x: 3, y: 5, color: "5" }, { x: 8, y: 2, color: "5" },
    { x: 12, y: 9, color: "5" }, { x: 6, y: 13, color: "5" }
  ]}
← 4 pixel(s) set. (dirt texture)

→ get     { id: "wall" }
← canvas_id: cvs-d3e6-004 (wall tile loaded as editable canvas)

→ tilemap { grid: [
    ["cvs-d3e6-004","cvs-d3e6-004","cvs-d3e6-004","cvs-d3e6-004"],
    ["cvs-d3e6-004","cvs-c2d5-003","cvs-c2d5-003","cvs-d3e6-004"],
    ["cvs-d3e6-004","cvs-c2d5-003","cvs-c2d5-003","cvs-d3e6-004"],
    ["cvs-d3e6-004","cvs-d3e6-004","door","cvs-d3e6-004"]
  ]}
← canvas_id: cvs-e4f7-005 (64x64 dungeon room — custom tiles + bundled "door")

→ character { seed: "hero" }
← canvas_id: cvs-f5a8-006 (procedural character loaded as canvas)

→ compose { layers: [
    { sprite: "cvs-e4f7-005", x: 0, y: 0 },
    { sprite: "cvs-f5a8-006", x: 24, y: 24 }
  ], width: 64, height: 64 }
← canvas_id: cvs-a6b9-007 (final scene: dungeon room with hero)

→ export  { canvas_id: "cvs-a6b9-007", scale: 2 }
← 128x128 PNG returned.
```

The agent created custom tiles, composed them with bundled assets, placed a character, and exported — all in one session.

## Bundled Sprites

**Items:** sword, shield, potion, key, bow, coin
**Tiles:** grass, stone, water, wall, door, tree, sand, dirt
**Effects:** slash, sparkle, explosion, heal
**UI:** heart-full, heart-empty, arrow-up, cursor

22 sprites. Use as-is, or `get` them into canvases and modify with drawing tools.

## 648 Procedural Characters

4 species (human, elf, dwarf, skeleton) x 3 armors x 3 weapons x 3 helms x 6 skin tones. Any string seed maps deterministically to one character.

## Palettes

- `pico8` — PICO-8 16-color (default)
- `grayscale` — 16 shades of grey
- `gameboy` — Original Game Boy 4-tone green

## CLI

```bash
npx pixscii import sprite.png --id my-sword --category items
npx pixscii export sword --scale 4 --out sword.png
```

## Development

```bash
npm install
npm run dev      # Start MCP server (stdio)
npm run build    # Compile TypeScript
npm test         # Run tests
```

## License

MIT
