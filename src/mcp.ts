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
import { DEFAULT_SCALE, MAX_SCALE, MAX_SEED_LENGTH, MAX_COMPOSE_LAYERS, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, MAX_TILEMAP_COLS, MAX_TILEMAP_ROWS, SPECIES, ARMORS, WEAPONS, HELMS, SKIN_TONES } from './constants.js';

const server = new McpServer({
  name: 'pixscii',
  version: '0.1.0',
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

      return {
        content: [
          {
            type: 'image' as const,
            data: base64,
            mimeType: 'image/png' as const,
          },
          {
            type: 'text' as const,
            text: `${entry.name} (${entry.id}) — ${entry.width}x${entry.height} @ ${scale ?? DEFAULT_SCALE}x, palette: ${pal.id}`,
          },
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

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `Character "${seed}": ${desc} @ ${scale ?? DEFAULT_SCALE}x` },
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

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `Scene: ${width}x${height}, ${layers.length} layers @ ${scale ?? DEFAULT_SCALE}x` },
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

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `Tilemap: ${grid[0].length}x${grid.length} tiles (${sprite.width}x${sprite.height}px) @ ${scale ?? DEFAULT_SCALE}x` },
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

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          {
            type: 'text' as const,
            text: `Converted to ${sprite.width}x${sprite.height} pixel art (palette: ${pal.id})\nSprite data:\n${JSON.stringify(sprite)}`,
          },
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

// --- main ---
async function main() {
  await Promise.all([loadIndex(), loadPalettes(), loadCharacterAssets()]);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
