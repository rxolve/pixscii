# pixscii

**LLMs can't draw. This MCP can.** A pixel art animation toolkit for AI agents.

Sister project of [artscii](https://github.com/rxolve/artscii). While artscii provides terminal ASCII art, pixscii gives AI agents a full pixel art workbench — generate characters, animate scenes, draw sprites, and export PNGs. Offline, deterministic, zero latency.

## One Call Animation

```json
animate_scene {
  "width": 128, "height": 48,
  "background": { "tiles": [["tree","grass","grass","sand","stone","wall","wall","door"]] },
  "actors": [
    { "seed": "hero", "species": "human", "armor": "plate", "weapon": "sword",
      "motion": "walk", "from": {"x":0,"y":28}, "to": {"x":96,"y":28} },
    { "seed": "mage", "species": "elf", "armor": "cloth", "weapon": "staff",
      "motion": "walk", "from": {"x":-16,"y":30}, "to": {"x":72,"y":30} },
    { "seed": "guard", "species": "skeleton", "motion": "idle",
      "from": {"x":108,"y":28}, "to": {"x":108,"y":28} }
  ],
  "frames": 24, "delay": 150
}
```

One tool call. 3 characters, tiled background, 24 frames. 9ms.

The LLM translates a scene description into structured input. pixscii executes it instantly.

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

## Tools (19)

### High-Level — Full scenes in one call

| Tool | Description |
|------|-------------|
| `animate_scene` | Text description → animated scene with characters, background, and motion |

### Source — Create or load a canvas

| Tool | Description |
|------|-------------|
| `create` | New blank canvas with optional fill color |
| `get` | Load a bundled sprite into an editable canvas |
| `character` | Generate a procedural pixel character |
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
| `sequence` | Animate actors across a scene with per-frame positions |
| `compose` | Layer multiple canvases/sprites into a scene |
| `tilemap` | Build a map from a tile grid |
| `spritesheet` | Stitch frames into a single PNG (horizontal/vertical/grid) |
| `animate` | Animate a sprite with pixel motion (idle, walk, attack...) |
| `export` | Render a canvas to scaled PNG |

## Three Layers of Control

```
Layer 1: animate_scene     → full scene in one call (fast path)
Layer 2: sequence/compose  → manual frame composition (precise control)
Layer 3: pixel/line/rect   → individual pixel editing (full control)
```

Start with `animate_scene` for a fast draft. Drop to lower layers to refine.

## Example: One-Call Scene Animation

```
→ animate_scene {
    width: 80, height: 40,
    background: { tiles: [["grass","grass","stone","wall","door","wall"]] },
    actors: [{
      seed: "hero-girl", species: "human", armor: "cloth",
      motion: "walk", from: {x:0, y:24}, to: {x:60, y:24}
    }],
    frames: 16, delay: 120
  }
← 16 frame PNGs + frame_ids

→ spritesheet { frames: [frame_ids], direction: "horizontal" }
← single strip PNG with all 16 frames
```

Two calls: one to generate, one to assemble. Done.

## Example: Drawing a Sprite from Scratch

```
→ create  { width: 16, height: 16, fill: "." }
← canvas_id + hex grid

→ rect    { canvas_id, x: 3, y: 5, w: 10, h: 9, color: "1" }
→ fill    { canvas_id, x: 7, y: 7, color: "8" }
← filled: 56 pixels, leaked: false (grid returned — agent verifies)

→ inspect { canvas_id }
← agent reads grid, spots issue, fixes with pixel tool

→ export  { canvas_id, scale: 4 }
← 64x64 PNG
```

## The Hex Grid Protocol

Every pixel is one character. The agent reads and writes in the same alphabet:

```
0-F = PICO-8 palette colors (0=black, 7=white, 8=red, ...)
.   = transparent
```

```
     0123456789ABCDEF
  0: ................
  1: .....111111.....
  2: .....177771.....
  3: .....177771.....
  4: ...1111111111...
  5: ...1888888881...
  6: ...1788888881...
```

~80 tokens for a full 16x16 sprite. The LLM reads this like source code and reasons about it spatially.

## Bundled Assets

**22 sprites** across 4 categories:
- **Items:** sword, shield, potion, key, bow, coin
- **Tiles:** grass, stone, water, wall, door, tree, sand, dirt
- **Effects:** slash, sparkle, explosion, heal
- **UI:** heart-full, heart-empty, arrow-up, cursor

**648 procedural characters:**
4 species (human, elf, dwarf, skeleton) x 3 armors x 3 weapons x 3 helms x 6 skin tones.

**3 palettes:** pico8 (default), grayscale, gameboy

**6 motion types:** idle, walk, attack, hurt, bounce, blink

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
