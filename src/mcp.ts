#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadPalettes, getPalette } from './palette.js';
import { renderToBase64 } from './render.js';
import { loadIndex, search, getById, getByCategory, getRandom, listCategories, listAll, loadSpriteData } from './store.js';
import { loadCharacterAssets, generateCharacter, describeCharacter } from './character.js';
import { composeScene } from './compose.js';
import { buildTilemap } from './tilemap.js';
import { createAnimation, MOTION_TYPES } from './animate.js';
import { resolveImageInput } from './resolve.js';
import { quantizeToSprite } from './convert.js';
import { createEmpty } from './sprite.js';
import { storeCanvas, requireCanvas, updateCanvas, setCanvasDirectly, parseColor, inspectCanvas } from './canvas.js';
import { setPixels, drawLine, drawRect, floodFill, mirrorH } from './draw.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_SEED_LENGTH, MAX_COMPOSE_LAYERS, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, MAX_TILEMAP_COLS, MAX_TILEMAP_ROWS, SPECIES, ARMORS, WEAPONS, HELMS, SKIN_TONES, MAX_PIXELS_PER_BATCH } from './constants.js';

// Route import/export subcommands to CLI before starting MCP server
const subcommand = process.argv[2];
if (subcommand === 'import' || subcommand === 'export') {
  const { runCLI } = await import('./cli.js');
  await runCLI(process.argv.slice(2));
  process.exit(0);
}

const server = new McpServer({
  name: 'pixscii',
  version: '0.2.0',
});

// --- search tool ---
server.tool(
  'search',
  'Search the sprite library by keyword, category, or get a random sprite. Returns a text listing of matching sprites.',
  {
    query: z.string().optional().describe('Search keyword (matches id, name, category, tags)'),
    category: z.string().optional().describe('Filter by category: items, tiles, effects, ui'),
    random: z.boolean().optional().describe('Return a single random sprite'),
  },
  async ({ query, category, random }) => {
    try {
      if (random) {
        const entry = getRandom();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Random sprite: ${entry.id} (${entry.name}) [${entry.category}] ${entry.width}x${entry.height}\nTags: ${entry.tags.join(', ')}`,
            },
          ],
        };
      }

      let results = query ? search(query) : category ? getByCategory(category) : listAll();

      if (category && query) {
        results = results.filter((e) => e.category === category);
      }

      if (results.length === 0) {
        const cats = listCategories();
        return {
          content: [
            {
              type: 'text' as const,
              text: `No sprites found. Available categories: ${cats.join(', ')}\nTotal sprites: ${listAll().length}`,
            },
          ],
        };
      }

      const lines = results.map(
        (e) => `- ${e.id} (${e.name}) [${e.category}] ${e.width}x${e.height} | ${e.tags.join(', ')}`,
      );
      const header = `Found ${results.length} sprite(s):`;
      return {
        content: [{ type: 'text' as const, text: header + '\n' + lines.join('\n') }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- get tool ---
server.tool(
  'get',
  'Get a sprite as a PNG image by its ID. Returns a scaled pixel art PNG.',
  {
    id: z.string().describe('Sprite ID (e.g. "sword", "grass", "heart-full")'),
    scale: z
      .number()
      .int()
      .min(1)
      .max(MAX_SCALE)
      .optional()
      .describe(`Scale factor 1-${MAX_SCALE} (default ${DEFAULT_SCALE}). Each pixel becomes scale×scale.`),
    palette: z.string().optional().describe('Palette ID (default "pico8"). Use search to see available palettes.'),
  },
  async ({ id, scale, palette: paletteId }) => {
    try {
      const entry = getById(id);
      if (!entry) {
        const all = listAll();
        const suggestions = all
          .filter((e) => e.id.includes(id) || e.tags.some((t) => t.includes(id)))
          .slice(0, 5);
        const msg = suggestions.length > 0
          ? `Sprite "${id}" not found. Did you mean: ${suggestions.map((s) => s.id).join(', ')}?`
          : `Sprite "${id}" not found. Use the search tool to browse available sprites.`;
        return {
          content: [{ type: 'text' as const, text: msg }],
          isError: true,
        };
      }

      const pal = getPalette(paletteId);
      const sprite = await loadSpriteData(entry);
      const base64 = await renderToBase64(sprite, pal, scale);
      const canvasId = storeCanvas({ data: sprite, width: sprite.width, height: sprite.height, palette: pal.id, prev: null });
      const grid = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\n\n${grid}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- character tool ---
server.tool(
  'character',
  'Generate a procedural RPG character sprite. Same seed always produces the same character. 648 unique combinations.',
  {
    seed: z.string().max(MAX_SEED_LENGTH).describe('Seed string for deterministic generation. Same seed = same character.'),
    species: z.enum(SPECIES as unknown as [string, ...string[]]).optional().describe(`Species: ${SPECIES.join(', ')}`),
    armor: z.enum(ARMORS as unknown as [string, ...string[]]).optional().describe(`Armor type: ${ARMORS.join(', ')}`),
    weapon: z.enum(WEAPONS as unknown as [string, ...string[]]).optional().describe(`Weapon type: ${WEAPONS.join(', ')}`),
    helm: z.enum(HELMS as unknown as [string, ...string[]]).optional().describe(`Helm type: ${HELMS.join(', ')}`),
    skin: z.number().int().min(0).max(SKIN_TONES.length - 1).optional().describe(`Skin tone index 0-${SKIN_TONES.length - 1}`),
    scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
    palette: z.string().optional().describe('Palette ID (default "pico8")'),
  },
  async ({ seed, species, armor, weapon, helm, skin, scale, palette: paletteId }) => {
    try {
      const options = { seed, species, armor, weapon, helm, skin };
      const sprite = generateCharacter(options);
      const pal = getPalette(paletteId);
      const base64 = await renderToBase64(sprite, pal, scale);
      const desc = describeCharacter(options);
      const canvasId = storeCanvas({ data: sprite, width: sprite.width, height: sprite.height, palette: pal.id, prev: null });
      const grid = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\nCharacter "${seed}": ${desc}\n\n${grid}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- animate tool ---
server.tool(
  'animate',
  'Animate a sprite or character with pixel motion. Returns multiple PNG frames or a spritesheet.',
  {
    id: z.string().optional().describe('Sprite ID to animate (use this OR seed)'),
    seed: z.string().max(MAX_SEED_LENGTH).optional().describe('Character seed to animate (use this OR id)'),
    motion: z.enum(MOTION_TYPES as unknown as [string, ...string[]]).describe(`Motion type: ${MOTION_TYPES.join(', ')}`),
    scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
    palette: z.string().optional().describe('Palette ID (default "pico8")'),
  },
  async ({ id, seed, motion, scale, palette: paletteId }) => {
    try {
      if (!id && !seed) {
        return {
          content: [{ type: 'text' as const, text: 'Provide either "id" (sprite ID) or "seed" (character seed)' }],
          isError: true,
        };
      }

      let sprite: import('./types.js').SpriteData;
      if (seed) {
        sprite = generateCharacter({ seed });
      } else {
        const entry = getById(id!);
        if (!entry) {
          return {
            content: [{ type: 'text' as const, text: `Sprite "${id}" not found` }],
            isError: true,
          };
        }
        sprite = await loadSpriteData(entry);
      }

      const pal = getPalette(paletteId);
      const anim = createAnimation(sprite, motion as import('./types.js').MotionType);

      // Render all frames
      const frameImages = await Promise.all(
        anim.frames.map((frame) => renderToBase64(frame, pal, scale)),
      );

      const content: ({ type: 'image'; data: string; mimeType: 'image/png' } | { type: 'text'; text: string })[] = [];
      for (const data of frameImages) {
        content.push({ type: 'image' as const, data, mimeType: 'image/png' as const });
      }
      content.push({
        type: 'text' as const,
        text: `Animation: ${motion}, ${anim.frames.length} frames, ${anim.delay}ms delay, ${anim.loop ? 'looping' : 'once'}`,
      });

      return { content };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- compose tool ---
server.tool(
  'compose',
  'Compose multiple sprites into a single scene. Place sprites at specific x,y positions on a canvas.',
  {
    layers: z.array(z.object({
      sprite: z.string().describe('Sprite ID'),
      x: z.number().int().describe('X position on canvas'),
      y: z.number().int().describe('Y position on canvas'),
    })).min(1).max(MAX_COMPOSE_LAYERS).describe('Layers to compose (back to front)'),
    width: z.number().int().min(16).max(MAX_CANVAS_WIDTH).describe('Canvas width in pixels'),
    height: z.number().int().min(16).max(MAX_CANVAS_HEIGHT).describe('Canvas height in pixels'),
    scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
    palette: z.string().optional().describe('Palette ID (default "pico8")'),
  },
  async ({ layers, width, height, scale, palette: paletteId }) => {
    try {
      const sprite = await composeScene(layers, width, height);
      const pal = getPalette(paletteId);
      const base64 = await renderToBase64(sprite, pal, scale);
      const canvasId = storeCanvas({ data: sprite, width: sprite.width, height: sprite.height, palette: pal.id, prev: null });
      const grid = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\nScene: ${width}x${height}, ${layers.length} layers\n\n${grid}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- tilemap tool ---
server.tool(
  'tilemap',
  'Build a tilemap from a 2D grid of tile IDs. Each cell becomes a 16x16 tile.',
  {
    grid: z.array(z.array(z.string())).min(1).max(MAX_TILEMAP_ROWS).describe('2D array of tile IDs (e.g. [["grass","grass","water"],["grass","door","grass"]])'),
    scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
    palette: z.string().optional().describe('Palette ID (default "pico8")'),
  },
  async ({ grid, scale, palette: paletteId }) => {
    try {
      if (grid.some((row) => row.length > MAX_TILEMAP_COLS)) {
        return {
          content: [{ type: 'text' as const, text: `Max ${MAX_TILEMAP_COLS} columns per row` }],
          isError: true,
        };
      }

      const sprite = await buildTilemap(grid);
      const pal = getPalette(paletteId);
      const base64 = await renderToBase64(sprite, pal, scale);
      const canvasId = storeCanvas({ data: sprite, width: sprite.width, height: sprite.height, palette: pal.id, prev: null });
      const grid2 = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\nTilemap: ${grid[0].length}x${grid.length} tiles (${sprite.width}x${sprite.height}px)\n\n${grid2}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- convert tool ---
server.tool(
  'convert',
  'Convert an image (URL or base64) to pixel art by quantizing to a palette. Returns both the PNG and sprite data.',
  {
    source: z.string().describe('Image URL (https://...) or base64 data URI'),
    width: z.number().int().min(1).max(64).optional().describe('Target width in pixels (default 16)'),
    height: z.number().int().min(1).max(64).optional().describe('Target height in pixels (default 16)'),
    scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor for output (default ${DEFAULT_SCALE})`),
    palette: z.string().optional().describe('Palette ID (default "pico8")'),
  },
  async ({ source, width, height, scale, palette: paletteId }) => {
    try {
      const imageBuffer = await resolveImageInput(source);
      const pal = getPalette(paletteId);
      const sprite = await quantizeToSprite(imageBuffer, pal, width, height);
      const base64 = await renderToBase64(sprite, pal, scale);
      const canvasId = storeCanvas({ data: sprite, width: sprite.width, height: sprite.height, palette: pal.id, prev: null });
      const grid = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\n\n${grid}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// --- create tool ---
server.tool(
  'create',
  'Create a new blank canvas for drawing. Returns canvas ID and hex grid for inspection.',
  {
    width: z.number().int().min(1).max(MAX_CANVAS_WIDTH).describe('Canvas width in pixels'),
    height: z.number().int().min(1).max(MAX_CANVAS_HEIGHT).describe('Canvas height in pixels'),
    fill: z.string().length(1).optional().describe('Fill color: hex char 0-F or "." for transparent (default ".")'),
    palette: z.string().optional().describe('Palette ID (default "pico8")'),
  },
  async ({ width, height, fill, palette: paletteId }) => {
    try {
      const pal = getPalette(paletteId);
      let data = createEmpty(width, height);
      if (fill && fill !== '.') {
        const c = parseColor(fill);
        const coords: Array<{ x: number; y: number; color: number }> = [];
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            coords.push({ x, y, color: c });
          }
        }
        data = setPixels(data, coords);
      }
      const id = storeCanvas({ data, width, height, palette: pal.id, prev: null });
      const text = inspectCanvas(id, requireCanvas(id));
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- pixel tool ---
server.tool(
  'pixel',
  'Set individual pixels on a canvas. Batch up to 512 pixels per call.',
  {
    canvas_id: z.string().describe('Canvas ID'),
    pixels: z.array(z.object({
      x: z.number().int().min(0).describe('X coordinate'),
      y: z.number().int().min(0).describe('Y coordinate'),
      color: z.string().length(1).describe('Hex char 0-F or "." for transparent'),
    })).min(1).max(MAX_PIXELS_PER_BATCH).describe('Pixels to set'),
  },
  async ({ canvas_id, pixels }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const coords = pixels.map((p) => ({ x: p.x, y: p.y, color: parseColor(p.color) }));
      const newData = setPixels(canvas.data, coords);
      updateCanvas(canvas_id, newData);
      return {
        content: [{ type: 'text' as const, text: `canvas_id: ${canvas_id}\n${pixels.length} pixel(s) set.` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- line tool ---
server.tool(
  'line',
  'Draw a line between two points on a canvas using Bresenham\'s algorithm.',
  {
    canvas_id: z.string().describe('Canvas ID'),
    x1: z.number().int().describe('Start X'),
    y1: z.number().int().describe('Start Y'),
    x2: z.number().int().describe('End X'),
    y2: z.number().int().describe('End Y'),
    color: z.string().length(1).describe('Hex char 0-F or "." for transparent'),
  },
  async ({ canvas_id, x1, y1, x2, y2, color }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const c = parseColor(color);
      const newData = drawLine(canvas.data, x1, y1, x2, y2, c);
      updateCanvas(canvas_id, newData);
      return {
        content: [{ type: 'text' as const, text: `canvas_id: ${canvas_id}\nLine drawn from (${x1},${y1}) to (${x2},${y2}).` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- rect tool ---
server.tool(
  'rect',
  'Draw a rectangle on a canvas (outline or filled).',
  {
    canvas_id: z.string().describe('Canvas ID'),
    x: z.number().int().describe('Top-left X'),
    y: z.number().int().describe('Top-left Y'),
    w: z.number().int().min(1).describe('Width'),
    h: z.number().int().min(1).describe('Height'),
    color: z.string().length(1).describe('Hex char 0-F or "." for transparent'),
    filled: z.boolean().optional().describe('Fill the rectangle (default: false = outline only)'),
  },
  async ({ canvas_id, x, y, w, h, color, filled }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const c = parseColor(color);
      const newData = drawRect(canvas.data, x, y, w, h, c, filled ?? false);
      updateCanvas(canvas_id, newData);
      return {
        content: [{ type: 'text' as const, text: `canvas_id: ${canvas_id}\nRect ${filled ? 'filled' : 'outline'} at (${x},${y}) ${w}x${h}.` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- fill tool ---
server.tool(
  'fill',
  'Flood fill from a point on a canvas. Returns the updated grid so you can verify the result.',
  {
    canvas_id: z.string().describe('Canvas ID'),
    x: z.number().int().min(0).describe('Start X'),
    y: z.number().int().min(0).describe('Start Y'),
    color: z.string().length(1).describe('Hex char 0-F or "." for transparent'),
  },
  async ({ canvas_id, x, y, color }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const c = parseColor(color);
      const { result, count, leaked } = floodFill(canvas.data, x, y, c);
      updateCanvas(canvas_id, result);
      const grid = inspectCanvas(canvas_id, requireCanvas(canvas_id));
      return {
        content: [{
          type: 'text' as const,
          text: `filled: ${count} pixels\nleaked: ${leaked}\n\n${grid}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- mirror tool ---
server.tool(
  'mirror',
  'Mirror a canvas horizontally (left half copied to right half). Returns the updated grid.',
  {
    canvas_id: z.string().describe('Canvas ID'),
    axis_x: z.number().int().min(0).optional().describe('X coordinate of mirror axis (default: center)'),
  },
  async ({ canvas_id, axis_x }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const newData = mirrorH(canvas.data, axis_x);
      updateCanvas(canvas_id, newData);
      const grid = inspectCanvas(canvas_id, requireCanvas(canvas_id));
      return { content: [{ type: 'text' as const, text: grid }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- inspect tool ---
server.tool(
  'inspect',
  'Read the current pixel state of a canvas as a hex character grid. For canvases >32px, provide x,y,w,h to inspect a region.',
  {
    canvas_id: z.string().describe('Canvas ID'),
    x: z.number().int().min(0).optional().describe('Region start X (for large canvases)'),
    y: z.number().int().min(0).optional().describe('Region start Y (for large canvases)'),
    w: z.number().int().min(1).optional().describe('Region width'),
    h: z.number().int().min(1).optional().describe('Region height'),
  },
  async ({ canvas_id, x, y, w, h }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const opts = x !== undefined || y !== undefined ? { x, y, w, h } : undefined;
      const text = inspectCanvas(canvas_id, canvas, opts);
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- undo tool ---
server.tool(
  'undo',
  'Revert the last drawing operation on a canvas. Single-step undo.',
  {
    canvas_id: z.string().describe('Canvas ID'),
  },
  async ({ canvas_id }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      if (!canvas.prev) {
        return {
          content: [{ type: 'text' as const, text: 'No previous state to undo.' }],
          isError: true,
        };
      }
      setCanvasDirectly(canvas_id, { ...canvas, data: canvas.prev, prev: null });
      const grid = inspectCanvas(canvas_id, requireCanvas(canvas_id));
      return { content: [{ type: 'text' as const, text: `Undone.\n\n${grid}` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- export tool ---
server.tool(
  'export',
  'Export a canvas as a scaled PNG image.',
  {
    canvas_id: z.string().describe('Canvas ID'),
    scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
  },
  async ({ canvas_id, scale }) => {
    try {
      const canvas = requireCanvas(canvas_id);
      const pal = getPalette(canvas.palette);
      const base64 = await renderToBase64(canvas.data, pal, scale);
      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `${canvas.width}x${canvas.height} @ ${scale ?? DEFAULT_SCALE}x, palette: ${pal.id}` },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
    }
  },
);

// --- main ---
async function main() {
  await Promise.all([loadIndex(), loadPalettes(), loadCharacterAssets()]);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
