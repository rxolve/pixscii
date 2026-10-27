# pixscii roadmap: from sprite library to pixel generator

## Why

pixscii's range is capped by what ships in `sprites/`: 4 character species, 8 tiles, 6 items, 4 effects, 3 palettes.
Drawing more sprites by hand does not scale, and LLMs cannot draw pixel grids directly.

The fix is generators, not more assets. Every generator writes the same thing pixscii already uses everywhere:
`SpriteData`, a grid of palette indices. So shapes, procedural scenes, creatures and converted images all compose,
animate, recolor and export with the existing tools.

## First consumer

[Light a Soul](https://github.com/rxolve/light-a-soul) (private): a browser life game where you are born as a person, a cat,
an elf, later a dragon, a robot or a nebula. It needs

- scenes in many moods (home, school, night, sea, storm, window, forest, dusk, stars) that shift with time of life
  (dawn, noon, dusk, night)
- beings at three life stages (baby, adult, old), many of them with no fixed shape (aliens, robots, nebulae)
- rendering in the browser at runtime, seeded so each life can look different
- scenes at 128×72 and beings at 24×24

Its needs set the order below. Nothing gets built without a concrete use there first.

## Principles

1. **One format.** Generators output `SpriteData`. No second image model.
2. **Swappable palettes.** Art can be drawn against named slots (sky, ground, ink, accent, skin...). Swapping the palette
   recolors everything, which is how one drawing serves many moods and later many art styles.
3. **A pure core.** Grid logic runs in the browser and in Node. `fs`, `sharp` and MCP live in adapters around it.
4. **Deterministic.** Same seed, same pixels.
5. **The MCP surface keeps working.** Existing tools keep their names and inputs through these milestones.

## Target layout

```
src/core/     pure TypeScript, no Node built-ins
              types, grid ops (draw, fill, mirror, compose, crop), palettes + remap,
              render to RGBA buffer, character, animate, scene, tilemap,
              shapes (new), generators (new)
src/node/     sprite and palette loading from sprites/ (fs), PNG/GIF encode and image import (sharp), CLI
src/mcp/      MCP server and tools
```

Package entry points: `pixscii` (the MCP bin, as now) and `pixscii/core` (browser-safe).

Today the pure part is already most of the code: `animate`, `canvas`, `compose`, `draw`, `resolve`, `scene`,
`scene-builder`, `tilemap` import nothing from Node. What ties the rest to Node is asset loading through `fs`
(`character`, `palette`, `sprite`, `store`) and `sharp` in `render` and `convert`.

## Milestones

### M1: core split (no behavior change), done in 0.4.0

- Move pure modules under `src/core/`. Asset loading goes behind a small loader interface: the Node adapter reads
  `sprites/`, a browser build imports the JSON
- `render` returns an RGBA buffer in core; PNG and GIF encoding stays in the Node adapter
- Add the `pixscii/core` export
- All existing tests pass. `src/core/boundary.test.ts` fails when core imports a Node built-in, and `dist/core` bundles
  for the browser with esbuild
- Release as 0.4.0

### M2: slot palettes, done

- A palette can name its indices as slots. Mood palettes share one slot schema
- `remap(grid, fromPalette, toPalette)` by slot name
- `inspect` shows slot names
- Ship one schema with Light a Soul's nine moods as the example set

### M3: shapes, done

A pixel-native rasterizer, so an agent writes geometry instead of pixels:

- polygon (scanline fill), circle and ellipse (midpoint), thick line, quadratic and cubic curves (flattened),
  rounded rect
- fills: solid slot, ordered dither between two slots (Bayer 4×4 / 8×8), banded gradients
- no anti-aliasing: every pixel is one palette index
- input is a JSON list of shapes. New MCP tool `shapes` draws a list onto a canvas

### M4: procedural landscapes

- sky by time of day (dawn, noon, dusk, night) as a dithered gradient, sun or moon, seeded star field
- layered hills and mountains from 1D noise ridges, sea as wave bands, forest as tree silhouettes, ground strip
- `landscape({ seed, width, height, time, layers })` plus an MCP tool
- target: any of Light a Soul's moods at 128×72 in one call

### M5: creatures

- mask generator: a half template whose cells are body, maybe-body or empty, mirrored, filled and shaded from a seed.
  Endless robots, aliens, nebula blobs
- 24×24 species templates for human, cat, elf at baby, adult and old, built on the existing character parts system

### Later

- `convert` with ordered dithering and slot palettes, so outside images land in the same palettes
- more tiles and parts only when a generator cannot make them

## Not in scope

- Growing the bundled library by hand as the main way to add range
- Changes to artscii

## Decided

- **`claude/pixel-os-investigation-qUXMr` is not merged.** It branched from 0.2.2, before the tool modules split (#1),
  32×32 sprites and hex string storage, and it rewrites the old single `mcp.ts`. Its pure grid helpers (`crop`, `resize`,
  `shift` in `draw.ts`) and `repalette` are worth porting into core when M2 and M3 need them. The branch stays as it is
