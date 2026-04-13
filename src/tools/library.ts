import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { search, getById, getByCategory, getRandom, listCategories, listAll, loadSpriteData } from '../store.js';
import { getPalette } from '../palette.js';
import { renderToBase64 } from '../render.js';
import { generateCharacter, describeCharacter } from '../character.js';
import { resolveImageInput } from '../resolve.js';
import { quantizeToSprite } from '../convert.js';
import { storeCanvas, requireCanvas, inspectCanvas } from '../canvas.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_SEED_LENGTH, SPECIES, ARMORS, WEAPONS, HELMS, SKIN_TONES } from '../constants.js';

export function register(server: McpServer): void {
  // --- search tool ---
  defineTool(server, 'search',
    'Search the sprite library by keyword, category, or get a random sprite. Returns a text listing of matching sprites.',
    {
      query: z.string().optional().describe('Search keyword (matches id, name, category, tags)'),
      category: z.string().optional().describe('Filter by category: items, tiles, effects, ui'),
      random: z.boolean().optional().describe('Return a single random sprite'),
    },
    async ({ query, category, random }) => {
      if (random) {
        const entry = getRandom();
        return {
          content: [{
            type: 'text' as const,
            text: `Random sprite: ${entry.id} (${entry.name}) [${entry.category}] ${entry.width}x${entry.height}\nTags: ${entry.tags.join(', ')}`,
          }],
        };
      }

      let results = query ? search(query) : category ? getByCategory(category) : listAll();

      if (category && query) {
        results = results.filter((e) => e.category === category);
      }

      if (results.length === 0) {
        const cats = listCategories();
        return {
          content: [{
            type: 'text' as const,
            text: `No sprites found. Available categories: ${cats.join(', ')}\nTotal sprites: ${listAll().length}`,
          }],
        };
      }

      const lines = results.map(
        (e) => `- ${e.id} (${e.name}) [${e.category}] ${e.width}x${e.height} | ${e.tags.join(', ')}`,
      );
      const header = `Found ${results.length} sprite(s):`;
      return {
        content: [{ type: 'text' as const, text: header + '\n' + lines.join('\n') }],
      };
    },
  );

  // --- get tool ---
  defineTool(server, 'get',
    'Get a sprite as a PNG image by its ID. Returns a scaled pixel art PNG.',
    {
      id: z.string().describe('Sprite ID (e.g. "sword", "grass", "heart-full")'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional()
        .describe(`Scale factor 1-${MAX_SCALE} (default ${DEFAULT_SCALE}). Each pixel becomes scale×scale.`),
      palette: z.string().optional().describe('Palette ID (default "pico8"). Use search to see available palettes.'),
    },
    async ({ id, scale, palette: paletteId }) => {
      const entry = getById(id);
      if (!entry) {
        const all = listAll();
        const suggestions = all
          .filter((e) => e.id.includes(id) || e.tags.some((t) => t.includes(id)))
          .slice(0, 5);
        const msg = suggestions.length > 0
          ? `Sprite "${id}" not found. Did you mean: ${suggestions.map((s) => s.id).join(', ')}?`
          : `Sprite "${id}" not found. Use the search tool to browse available sprites.`;
        return { content: [{ type: 'text' as const, text: msg }], isError: true };
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
    },
  );

  // --- character tool ---
  defineTool(server, 'character',
    'Generate a procedural pixel character sprite. Same seed always produces the same character. 648 unique combinations.',
    {
      seed: z.string().max(MAX_SEED_LENGTH).describe('Seed string for deterministic generation. Same seed = same character.'),
      species: z.enum(SPECIES).optional().describe(`Species: ${SPECIES.join(', ')}`),
      armor: z.enum(ARMORS).optional().describe(`Armor type: ${ARMORS.join(', ')}`),
      weapon: z.enum(WEAPONS).optional().describe(`Weapon type: ${WEAPONS.join(', ')}`),
      helm: z.enum(HELMS).optional().describe(`Helm type: ${HELMS.join(', ')}`),
      skin: z.number().int().min(0).max(SKIN_TONES.length - 1).optional().describe(`Skin tone index 0-${SKIN_TONES.length - 1}`),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ seed, species, armor, weapon, helm, skin, scale, palette: paletteId }) => {
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
    },
  );

  // --- convert tool ---
  defineTool(server, 'convert',
    'Convert an image (URL or base64) to pixel art by quantizing to a palette. Returns both the PNG and sprite data.',
    {
      source: z.string().describe('Image URL (https://...) or base64 data URI'),
      width: z.number().int().min(1).max(64).optional().describe('Target width in pixels (default 16)'),
      height: z.number().int().min(1).max(64).optional().describe('Target height in pixels (default 16)'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor for output (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ source, width, height, scale, palette: paletteId }) => {
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
    },
  );
}
