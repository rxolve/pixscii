import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { findPalette, getPalette } from '../../core/palette.js';
import { landscape, LANDSCAPE_LAYERS, LANDSCAPE_PRESETS, type LandscapeLayer } from '../../core/landscape.js';
import { renderToBase64 } from '../../node/png.js';
import { storeCanvas, requireCanvas, inspectCanvas } from '../../core/canvas.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, MAX_SEED_LENGTH } from '../../core/constants.js';

const PRESETS = Object.keys(LANDSCAPE_PRESETS) as [string, ...string[]];

export function register(server: McpServer): void {
  defineTool(server, 'landscape',
    `Generate a pixel landscape from a seed: sky by time of day, sun or moon, stars, clouds, mountains, hills, sea, forest, ground, rain. Uses the "scene" palette schema, so the same seed renders in any scene-* palette. Presets: ${PRESETS.join(', ')}. Returns a canvas you can keep drawing on.`,
    {
      seed: z.string().max(MAX_SEED_LENGTH).describe('Same seed, same place'),
      preset: z.enum(PRESETS).optional().describe('Mood preset: sets time, layers and the default palette'),
      time: z.enum(['dawn', 'noon', 'dusk', 'night']).optional(),
      layers: z.array(z.enum(LANDSCAPE_LAYERS as [LandscapeLayer, ...LandscapeLayer[]])).optional().describe('Drawn back to front in a fixed order'),
      width: z.number().int().min(16).max(MAX_CANVAS_WIDTH).optional().describe('Default 128'),
      height: z.number().int().min(16).max(MAX_CANVAS_HEIGHT).optional().describe('Default 72'),
      horizon: z.number().min(0.1).max(0.95).optional().describe('Horizon height from the top, 0-1 (default 0.62)'),
      palette: z.string().optional().describe('A scene-* palette (default scene-<preset>, or scene-dusk)'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Preview scale (default ${DEFAULT_SCALE})`),
    },
    async ({ seed, preset, time, layers, width, height, horizon, palette, scale }) => {
      const data = landscape({ seed, preset, time, layers, width, height, horizon });
      const pal = palette ? getPalette(palette) : (findPalette(`scene-${preset ?? 'dusk'}`) ?? getPalette('scene-dusk'));
      if (pal.schema !== 'scene') throw new Error(`Palette "${pal.id}" is not a scene palette. Use one of the scene-* palettes.`);
      const id = storeCanvas({ data, width: data.width, height: data.height, palette: pal.id, prev: null });
      const base64 = await renderToBase64(data, pal, scale);
      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: inspectCanvas(id, requireCanvas(id)) },
        ],
      };
    },
  );
}
