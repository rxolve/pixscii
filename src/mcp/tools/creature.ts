import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { getPalette } from '../../core/palette.js';
import { creature, being, CREATURE_KINDS, BEING_SPECIES, LIFE_STAGES } from '../../core/creature.js';
import { renderToBase64 } from '../../node/png.js';
import { storeCanvas, requireCanvas, inspectCanvas } from '../../core/canvas.js';
import type { SpriteData } from '../../core/types.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_SEED_LENGTH } from '../../core/constants.js';

async function show(data: SpriteData, paletteId: string | undefined, scale: number | undefined) {
  const pal = getPalette(paletteId ?? 'scene-window');
  if (pal.schema !== 'scene') throw new Error(`Palette "${pal.id}" is not a scene palette. Use one of the scene-* palettes.`);
  const id = storeCanvas({ data, width: data.width, height: data.height, palette: pal.id, prev: null });
  const base64 = await renderToBase64(data, pal, scale ?? DEFAULT_SCALE * 2);
  return {
    content: [
      { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
      { type: 'text' as const, text: inspectCanvas(id, requireCanvas(id)) },
    ],
  };
}

const palette = z.string().optional().describe('A scene-* palette (default scene-window)');
const scale = z.number().int().min(1).max(MAX_SCALE).optional().describe(`Preview scale (default ${DEFAULT_SCALE * 2})`);

export function register(server: McpServer): void {
  defineTool(server, 'creature',
    'Generate a creature from a seed: symmetric robot, alien or critter from a mask (outlined, lit from the top, with eyes), or an asymmetric nebula. Endless variety, same seed same creature. Scene palette schema.',
    {
      seed: z.string().max(MAX_SEED_LENGTH),
      kind: z.enum(CREATURE_KINDS as [string, ...string[]]).optional().describe('Default alien'),
      size: z.number().int().min(8).max(64).optional().describe('Even, default 24'),
      palette,
      scale,
    },
    async ({ seed, kind, size, palette, scale }) => show(creature({ seed, kind, size }), palette, scale),
  );

  defineTool(server, 'being',
    'Draw a 24×24 person, cat or elf at a life stage: baby, adult or old (white hair, a cane or staff, a plumper cat). The seed varies hair and clothes. Scene palette schema.',
    {
      species: z.enum(BEING_SPECIES as [string, ...string[]]),
      stage: z.enum(LIFE_STAGES as [string, ...string[]]),
      seed: z.string().max(MAX_SEED_LENGTH).optional(),
      palette,
      scale,
    },
    async ({ species, stage, seed, palette, scale }) => show(being({ species, stage, seed }), palette, scale),
  );
}
