# pixscii

**The pixel OS for AI agents.**

LLMs can't hold a brush. pixscii is the operating system they boot into when they need to draw — a deterministic, offline pixel workbench served over MCP. Canvases are processes. Tools are syscalls. The hex grid is stdout.

Sister project of [artscii](https://github.com/rxolve/artscii) (terminal ASCII art).

## The Kernel Loop

```
draw → inspect → correct → export
```

The agent issues syscalls, reads the canvas back as text, reasons about it, and patches what's wrong. Zero latency, no pixel guessing.

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

## Syscalls (30)

### Source — allocate a canvas

| Syscall | Description |
|------|-------------|
| `create` | New blank canvas with optional fill color |
| `get` | Load a bundled sprite into an editable canvas |
| `character` | Generate a procedural RPG character |
| `convert` | Quantize any image (URL or base64) to pixel art |
| `search` | Browse the sprite library |

### Mutate — draw on a canvas

| Syscall | Description |
|------|-------------|
| `pixel` | Set individual pixels (batch up to 512) |
| `line` | Bresenham line between two points |
| `rect` | Rectangle — outline or filled |
| `fill` | Flood fill from a point (with leak detection) |
| `mirror` | Mirror left half to right half |
| `shift` | Shift all pixels by (dx, dy); optional wraparound |
| `resize` | Crop or extend the canvas to new dimensions (in-place, with offset) |
| `crop` | Shrink the canvas to the tight bounding box of its non-transparent content |
| `undo` | Revert the last drawing operation |
| `copy` | Blit a rectangular region from one canvas onto another (supports self-copy with overlap) |
| `repalette` | Switch a canvas's palette mode without touching pixel indices |

### Observe — read canvas state

| Syscall | Description |
|------|-------------|
| `inspect` | View the canvas as a hex character grid |
| `list` | List every live canvas in the session (dimensions, palette, pixel count, undo state) |
| `stat` | Deep single-canvas metadata — aliases, bounding box, color histogram with palette names, snapshot names |
| `diff` | Pixel-level diff between two canvases — unchanged pixels as `=`, changes as the new color |
| `palettes` | List all loaded palette IDs and color counts (discovery for `repalette`) |

### Process control — branch, checkpoint, reuse

| Syscall | Description |
|------|-------------|
| `clone` | Fork a canvas into a fresh ID so you can branch edits safely |
| `snapshot` | Save the current canvas state under a name (multi-step checkpoint beyond single `undo`) |
| `restore` | Restore a named snapshot; current state becomes `prev` so you can still `undo` the restore |
| `alias` | Give a canvas a human-readable name that works anywhere a `canvas_id` is accepted |
| `kill` | Free a canvas slot (and its aliases + snapshots) so the 40-canvas FIFO limit doesn't evict something you care about |

### Compose & output

| Syscall | Description |
|------|-------------|
| `compose` | Layer multiple canvases/sprites into a scene |
| `tilemap` | Build a map from a tile grid |
| `animate` | Animate a sprite with pixel motion |
| `sequence` | Animate actors across a scene over many frames |
| `spritesheet` | Stitch canvases into a single PNG sheet |
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

## Branching Edits with `clone` + `diff`

Sometimes the agent wants to try a change without losing the current state. The OS model makes that trivial: fork the canvas, edit the fork, diff them, keep the winner.

```
→ clone   { canvas_id: "cvs-a3f2-001" }
← cvs-b3c5-002 (independent copy — same pixels, no undo history)

→ rect    { canvas_id: "cvs-b3c5-002", x: 4, y: 4, w: 8, h: 8, color: "9", filled: true }
← Rect filled at (4,4) 8x8.

→ diff    { a: "cvs-a3f2-001", b: "cvs-b3c5-002" }
← diff: cvs-a3f2-001 -> cvs-b3c5-002
  size: 16x16 | changed: 64/256

       0123456789ABCDEF
    0: ================
    1: ================
    2: ================
    3: ================
    4: ====99999999====
    5: ====99999999====
    ...
```

`=` is "same pixel". Everything else is the new color at that spot. The agent sees exactly what the edit did and decides whether to keep the fork or throw it away.

## `list` — see the whole process table

```
→ list {}
← Live canvases (3):
  - cvs-a3f2-001 [hero] | 16x16 | palette: pico8 | pixels: 78/256  | undo: yes | snapshots: 2
  - cvs-b3c5-002       | 16x16 | palette: pico8 | pixels: 142/256 | undo: no  | snapshots: 0
  - cvs-e4f7-005 [dungeon] | 64x64 | palette: pico8 | pixels: 2048/4096 | undo: no | snapshots: 0
```

Useful when an agent loses track of which canvas holds what — especially after a long `compose` / `tilemap` / `character` chain.

## Checkpoints with `snapshot` / `restore`

`undo` only remembers one step back. For longer experiments — "let me try this, and if it's worse, roll back three edits" — use named snapshots.

```
→ snapshot { canvas_id: "cvs-a3f2-001", name: "before-shading" }
← Snapshot "before-shading" saved on cvs-a3f2-001. (1 total: before-shading)

→ rect { canvas_id: "cvs-a3f2-001", ... }   ← experimental shading pass
→ fill { canvas_id: "cvs-a3f2-001", ... }
→ pixel { canvas_id: "cvs-a3f2-001", ... }

→ inspect { canvas_id: "cvs-a3f2-001" }
← (agent decides the shading made it worse)

→ restore { canvas_id: "cvs-a3f2-001", name: "before-shading" }
← Restored "before-shading" onto cvs-a3f2-001. (current state becomes prev — agent can still undo the restore)
```

Snapshots are isolated deep copies — later edits on the live canvas cannot corrupt them. Up to 16 named snapshots per canvas.

## Palette as a mode: `repalette`

Because colors are just hex indices `0-F`, the same pixel data renders differently under different palettes. `repalette` flips the mode without touching a single pixel.

```
→ get { id: "sword" }                             ← loads under pico8
→ repalette { canvas_id: "...", palette: "gameboy" }
→ export { canvas_id: "...", scale: 4 }           ← same sword, Game Boy green
→ repalette { canvas_id: "...", palette: "grayscale" }
→ export { canvas_id: "...", scale: 4 }           ← same sword, grayscale
```

Zero pixel mutation, three aesthetics from one canvas.

## Blitting with `copy`

`copy` is the pixel-level `memcpy` — move a rectangular region from one canvas onto another, at any position. Transparent source pixels are skipped by default, so you can stamp a foreground sprite onto a background without carrying a square mask.

```
→ create { width: 32, height: 32, fill: "." }
← canvas_id: cvs-bg-001

→ get { id: "sword" }
← canvas_id: cvs-sw-002 (16x16)

→ copy { src: "cvs-sw-002", dst: "cvs-bg-001", dx: 8, dy: 8 }
← Copied 16x16 from cvs-sw-002(0,0) to cvs-bg-001(8,8).
```

Useful for:
- Stamping a reusable motif (eye, rune, tile) at multiple positions.
- Self-copy: shifting a region on one canvas by passing the same ID as `src` and `dst`. Overlapping reads/writes are handled safely — the source region is buffered before any destination write.
- Extracting a sub-region: `sx, sy, w, h` pick the source rectangle; omit them to copy the whole source.

Set `include_transparent: true` if you actually want the transparent source pixels to erase the destination (rare, but there when you need it).

## Freeing slots with `kill`

The session holds at most 40 live canvases. Beyond that, the oldest is evicted FIFO. That's usually fine — but if you've just built a valuable composed scene and an agent keeps spawning experimental canvases, the scene can get evicted out from under you. `kill` gives the agent explicit control:

```
→ kill { canvas_id: "cvs-scratch-003" }
← Killed cvs-scratch-003. 12 canvas(es) remain.
```

Kills the canvas and all its snapshots. Reclaims one slot.

## Scroll and reframe: `shift` and `resize`

`shift` slides every pixel by `(dx, dy)`. Vacated pixels become transparent by default, or wrap around to the opposite edge if `wrap: true` — useful for scrolling backgrounds.

```
→ shift { canvas_id: "...", dx: 1, dy: 0 }         ← slide right one column
→ shift { canvas_id: "...", dx: -1, dy: 0, wrap: true }   ← scroll a torus
```

`resize` crops or extends the canvas to new dimensions in place. The existing pixels land at `(offset_x, offset_y)` in the new frame; everything outside the new bounds is cropped, and any new area is transparent.

```
→ resize { canvas_id: "...", width: 32, height: 32, offset_x: 8, offset_y: 8 }
```

Grows a 16×16 into a 32×32 with the old content centered. Combined with `copy`, this is how you pull a tight sprite into a scene-sized canvas without starting over.

Both `shift` and `resize` participate in single-step undo, so one bad reframe is always recoverable.

## Names, not IDs: `alias`

Raw canvas IDs like `cvs-f5a8-006` are fine for one-off edits but painful across a long session. `alias` gives any canvas a human-readable name that every tool recognizes:

```
→ character { seed: "hero" }
← canvas_id: cvs-f5a8-006

→ alias { canvas_id: "cvs-f5a8-006", name: "hero" }
← Alias "hero" -> cvs-f5a8-006.

→ rect { canvas_id: "hero", x: 6, y: 4, w: 4, h: 1, color: "8" }
→ snapshot { canvas_id: "hero", name: "v1" }
→ inspect { canvas_id: "hero" }
```

Every `canvas_id` parameter accepts an alias. Rules: lowercase letters / digits / `_` / `-`, not starting with `cvs-`, up to 32 chars. Aliases are released when the canvas is killed, and `list` shows them in brackets.

## Deep introspection: `stat`

Where `inspect` shows the raw hex grid, `stat` shows the agent-oriented summary — useful for planning the next edit without re-parsing pixels.

```
→ stat { canvas_id: "hero" }
← id: cvs-f5a8-006
  aliases: hero
  size: 16x16 | palette: pico8
  filled: 78/256 (30.5%)
  bbox: (3,1) 10x14
  colors:
    1 (dark-blue): 32
    7 (white): 8
    8 (red): 30
    2 (dark-purple): 8
  undo: yes
  snapshots: before-shading, v1
```

The bbox is tight — just the non-transparent region — which is exactly what `crop` uses.

## Tightening: `crop`

`crop` shrinks a canvas to the bounding box of its content. No more transparent margins; the sprite becomes exactly as big as it needs to be.

```
→ stat { canvas_id: "hero" }
← bbox: (3,1) 10x14  (so there's 3px of left padding, 1px of top padding)

→ crop { canvas_id: "hero" }
← Cropped hero: 16x16 -> 10x14 (bbox was at 3,1).
```

Errors if the canvas is fully transparent. No-ops if the content already fills the canvas. Participates in undo.

## Discovering palettes

`palettes` is `ls /dev/palettes` — the agent asks what's installed before calling `repalette`:

```
→ palettes {}
← Palettes (3):
  - pico8 (PICO-8) | 16 colors
  - grayscale (Grayscale) | 16 colors
  - gameboy (Game Boy) | 4 colors
```

## Example: Drawing a Health Potion from Scratch

```
→ create  { width: 16, height: 16, fill: "." }
← canvas_id: cvs-a3f2-001 (blank grid)

→ rect    { canvas_id: "cvs-a3f2-001", x: 3, y: 5, w: 10, h: 9, color: "1" }
→ rect    { canvas_id: "cvs-a3f2-001", x: 5, y: 1, w: 6, h: 4, color: "1" }
→ fill    { canvas_id: "cvs-a3f2-001", x: 7, y: 7, color: "8" }
→ rect    { canvas_id: "cvs-a3f2-001", x: 6, y: 2, w: 4, h: 2, color: "7", filled: true }
→ line    { canvas_id: "cvs-a3f2-001", x1: 5, y1: 7, x2: 5, y2: 11, color: "7" }
→ inspect { canvas_id: "cvs-a3f2-001" }
← (agent reads grid, spots a stray pixel at row 4)
→ pixel   { canvas_id: "cvs-a3f2-001", pixels: [{ x: 5, y: 4, color: "1" }] }
→ export  { canvas_id: "cvs-a3f2-001", scale: 4 }
← 64x64 PNG returned.
```

## Example: Build a Dungeon Scene

```
→ create  { width: 16, height: 16, fill: "4" }       ← custom floor tile
→ get     { id: "wall" }                              ← bundled wall as canvas
→ tilemap { grid: [[...]], }                          ← room layout
→ character { seed: "hero" }                          ← procedural character
→ compose { layers: [...], width: 64, height: 64 }    ← final scene
→ export  { canvas_id: "...", scale: 2 }              ← 128x128 PNG
```

Custom tiles + bundled assets + characters + compose — one session, one exported PNG.

## Bundled Sprites

**Items:** sword, shield, potion, key, bow, coin
**Tiles:** grass, stone, water, wall, door, tree, sand, dirt
**Effects:** slash, sparkle, explosion, heal
**UI:** heart-full, heart-empty, arrow-up, cursor

22 sprites. Use as-is, or `get` them into canvases and modify with drawing tools.

## 648 Procedural Characters

4 species (human, elf, dwarf, skeleton) × 3 armors × 3 weapons × 3 helms × 6 skin tones. Any string seed maps deterministically to one character.

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
