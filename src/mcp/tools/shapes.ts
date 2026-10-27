import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { getPalette } from '../../core/palette.js';
import { drawShapes, MAX_SHAPES, type Shape } from '../../core/shapes.js';
import { renderToBase64 } from '../../node/png.js';
import { createEmpty } from '../../core/sprite.js';
import { storeCanvas, requireCanvas, updateCanvas, inspectCanvas } from '../../core/canvas.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT } from '../../core/constants.js';

const color = z.union([z.number().int().min(-1), z.string()])
  .describe('Palette index, hex char "0"-"F" ("." = transparent), or a slot name like "sky-top" (see the palettes tool)');
const pattern = z.enum(['bayer2', 'bayer4', 'bayer8']).optional().describe('Dither pattern (default bayer4)');
const fill = z.union([
  color,
  z.object({
    dither: z.tuple([color, color]),
    amount: z.number().min(0).max(1).optional().describe('Share of the second color, 0-1 (default 0.5)'),
    pattern,
  }),
  z.object({
    gradient: z.array(color).min(1).describe('Color stops, dithered between neighbors'),
    direction: z.enum(['down', 'up', 'right', 'left']).optional(),
    pattern,
  }),
]);
const stroke = z.object({ color, width: z.number().int().min(1).max(8).optional() }).describe('Outline inside the edge');
const point = z.tuple([z.number(), z.number()]);

const shape = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rect'), x: z.number(), y: z.number(), w: z.number(), h: z.number(), radius: z.number().optional(), fill: fill.optional(), stroke: stroke.optional() }),
  z.object({ type: z.literal('circle'), cx: z.number(), cy: z.number(), r: z.number().positive(), fill: fill.optional(), stroke: stroke.optional() }),
  z.object({ type: z.literal('ellipse'), cx: z.number(), cy: z.number(), rx: z.number().positive(), ry: z.number().positive(), fill: fill.optional(), stroke: stroke.optional() }),
  z.object({ type: z.literal('polygon'), points: z.array(point).min(3), fill: fill.optional(), stroke: stroke.optional() }),
  z.object({ type: z.literal('line'), points: z.array(point).min(1), color, width: z.number().min(1).max(32).optional() }),
  z.object({ type: z.literal('curve'), points: z.array(point).min(3).max(4).describe('3 = quadratic, 4 = cubic Bezier'), color, width: z.number().min(1).max(32).optional() }),
]);

export function register(server: McpServer): void {
  defineTool(server, 'shapes',
    'Draw geometry as crisp pixel art: rect (with radius), circle, ellipse, polygon, line, curve. Fills can be a color, a dither of two colors, or a dithered gradient; filled shapes can have an outline. Draws on an existing canvas, or creates one. Write coordinates, not pixels.',
    {
      shapes: z.array(shape).min(1).max(MAX_SHAPES).describe('Drawn in order, later on top'),
      canvas_id: z.string().optional().describe('Draw on this canvas. Omit to create a new one'),
      width: z.number().int().min(1).max(MAX_CANVAS_WIDTH).optional().describe('New canvas width (default 64)'),
      height: z.number().int().min(1).max(MAX_CANVAS_HEIGHT).optional().describe('New canvas height (default 64)'),
      palette: z.string().optional().describe('New canvas palette, e.g. "scene-dusk" for slot names (default "pico8")'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Preview scale (default ${DEFAULT_SCALE})`),
    },
    async ({ shapes, canvas_id, width, height, palette, scale }) => {
      let id = canvas_id as string | undefined;
      if (!id) {
        const pal = getPalette(palette);
        const w = width ?? 64;
        const h = height ?? 64;
        id = storeCanvas({ data: createEmpty(w, h), width: w, height: h, palette: pal.id, prev: null });
      }
      const canvas = requireCanvas(id);
      const pal = getPalette(canvas.palette);
      updateCanvas(id, drawShapes(canvas.data, shapes as Shape[], pal));
      const updated = requireCanvas(id);
      const base64 = await renderToBase64(updated.data, pal, scale);
      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: inspectCanvas(id, updated) },
        ],
      };
    },
  );
}
