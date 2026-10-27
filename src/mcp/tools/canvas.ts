import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { getPalette } from '../palette.js';
import { renderToBase64 } from '../render.js';
import { createEmpty } from '../sprite.js';
import { storeCanvas, requireCanvas, updateCanvas, setCanvasDirectly, parseColor, inspectCanvas } from '../canvas.js';
import { setPixels, drawLine, drawRect, floodFill, mirrorH } from '../draw.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, MAX_PIXELS_PER_BATCH } from '../constants.js';

export function register(server: McpServer): void {
  // --- create tool ---
  defineTool(server, 'create',
    'Create a new blank canvas for drawing. Returns canvas ID and hex grid for inspection.',
    {
      width: z.number().int().min(1).max(MAX_CANVAS_WIDTH).describe('Canvas width in pixels'),
      height: z.number().int().min(1).max(MAX_CANVAS_HEIGHT).describe('Canvas height in pixels'),
      fill: z.string().length(1).optional().describe('Fill color: hex char 0-F or "." for transparent (default ".")'),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ width, height, fill, palette: paletteId }) => {
      const pal = getPalette(paletteId);
      const fillColor = fill ? parseColor(fill) : -1;
      const data = createEmpty(width, height, fillColor);
      const id = storeCanvas({ data, width, height, palette: pal.id, prev: null });
      const text = inspectCanvas(id, requireCanvas(id));
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // --- pixel tool ---
  defineTool(server, 'pixel',
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
      const canvas = requireCanvas(canvas_id);
      const coords = pixels.map((p: { x: number; y: number; color: string }) => ({ x: p.x, y: p.y, color: parseColor(p.color) }));
      const newData = setPixels(canvas.data, coords);
      updateCanvas(canvas_id, newData);
      return {
        content: [{ type: 'text' as const, text: `canvas_id: ${canvas_id}\n${pixels.length} pixel(s) set.` }],
      };
    },
  );

  // --- line tool ---
  defineTool(server, 'line',
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
      const canvas = requireCanvas(canvas_id);
      const c = parseColor(color);
      const newData = drawLine(canvas.data, x1, y1, x2, y2, c);
      updateCanvas(canvas_id, newData);
      return {
        content: [{ type: 'text' as const, text: `canvas_id: ${canvas_id}\nLine drawn from (${x1},${y1}) to (${x2},${y2}).` }],
      };
    },
  );

  // --- rect tool ---
  defineTool(server, 'rect',
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
      const canvas = requireCanvas(canvas_id);
      const c = parseColor(color);
      const newData = drawRect(canvas.data, x, y, w, h, c, filled ?? false);
      updateCanvas(canvas_id, newData);
      return {
        content: [{ type: 'text' as const, text: `canvas_id: ${canvas_id}\nRect ${filled ? 'filled' : 'outline'} at (${x},${y}) ${w}x${h}.` }],
      };
    },
  );

  // --- fill tool ---
  defineTool(server, 'fill',
    'Flood fill from a point on a canvas. Returns the updated grid so you can verify the result.',
    {
      canvas_id: z.string().describe('Canvas ID'),
      x: z.number().int().min(0).describe('Start X'),
      y: z.number().int().min(0).describe('Start Y'),
      color: z.string().length(1).describe('Hex char 0-F or "." for transparent'),
    },
    async ({ canvas_id, x, y, color }) => {
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
    },
  );

  // --- mirror tool ---
  defineTool(server, 'mirror',
    'Mirror a canvas horizontally (left half copied to right half). Returns the updated grid.',
    {
      canvas_id: z.string().describe('Canvas ID'),
      axis_x: z.number().int().min(0).optional().describe('X coordinate of mirror axis (default: center)'),
    },
    async ({ canvas_id, axis_x }) => {
      const canvas = requireCanvas(canvas_id);
      const newData = mirrorH(canvas.data, axis_x);
      updateCanvas(canvas_id, newData);
      const grid = inspectCanvas(canvas_id, requireCanvas(canvas_id));
      return { content: [{ type: 'text' as const, text: grid }] };
    },
  );

  // --- inspect tool ---
  defineTool(server, 'inspect',
    'Read the current pixel state of a canvas as a hex character grid. For canvases >32px, provide x,y,w,h to inspect a region.',
    {
      canvas_id: z.string().describe('Canvas ID'),
      x: z.number().int().min(0).optional().describe('Region start X (for large canvases)'),
      y: z.number().int().min(0).optional().describe('Region start Y (for large canvases)'),
      w: z.number().int().min(1).optional().describe('Region width'),
      h: z.number().int().min(1).optional().describe('Region height'),
    },
    async ({ canvas_id, x, y, w, h }) => {
      const canvas = requireCanvas(canvas_id);
      const opts = x !== undefined || y !== undefined ? { x, y, w, h } : undefined;
      const text = inspectCanvas(canvas_id, canvas, opts);
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // --- undo tool ---
  defineTool(server, 'undo',
    'Revert the last drawing operation on a canvas. Single-step undo.',
    {
      canvas_id: z.string().describe('Canvas ID'),
    },
    async ({ canvas_id }) => {
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
    },
  );

  // --- export tool ---
  defineTool(server, 'export',
    'Export a canvas as a scaled PNG image.',
    {
      canvas_id: z.string().describe('Canvas ID'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
    },
    async ({ canvas_id, scale }) => {
      const canvas = requireCanvas(canvas_id);
      const pal = getPalette(canvas.palette);
      const base64 = await renderToBase64(canvas.data, pal, scale);
      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `${canvas.width}x${canvas.height} @ ${scale ?? DEFAULT_SCALE}x, palette: ${pal.id}` },
        ],
      };
    },
  );
}
