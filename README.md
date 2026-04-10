# pixscii

**LLMs can't draw. This MCP can.** Curated pixel art sprites for AI agents.

Sister project of [artscii](https://github.com/rxolve/artscii). While artscii provides terminal ASCII art, pixscii provides RPG pixel art PNGs — offline, 0ms, deterministic.

## Features

- **22 curated sprites** — items, tiles, effects, UI elements
- **864 procedural characters** — 4 species × 3 armors × 3 weapons × 4 helms × 6 skin tones
- **Tilemap builder** — compose tile grids into full scenes
- **Scene composer** — layer sprites at arbitrary positions
- **6 animations** — idle, walk, attack, hurt, bounce, blink
- **Image converter** — quantize any image to pixel art
- **3 palettes** — PICO-8 (default), Grayscale, Game Boy
- **Deterministic** — same seed always produces the same character

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

## Tools

| Tool | Description |
|------|-------------|
| `search` | Search sprites by keyword, category, or get random |
| `get` | Get a sprite as scaled PNG |
| `character` | Generate procedural RPG character |
| `animate` | Animate sprite/character with pixel motion |
| `compose` | Layer sprites into a scene |
| `tilemap` | Build a map from tile grid |
| `convert` | Convert image to pixel art |

## Sprites

**Items:** sword, shield, potion, key, bow, coin
**Tiles:** grass, stone, water, wall, door, tree, sand, dirt
**Effects:** slash, sparkle, explosion, heal
**UI:** heart-full, heart-empty, arrow-up, cursor

## Palettes

- `pico8` — PICO-8 16-color (default)
- `grayscale` — 16 shades of grey
- `gameboy` — Original Game Boy 4-tone green

## Development

```bash
npm install
npm run dev      # Start MCP server (stdio)
npm run build    # Compile TypeScript
npm test         # Run tests
```

## License

MIT
