import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { getPalette, findPalette, listPalettes } from '../../core/palette.js';
import { slotNames, remapPalette } from '../../core/slots.js';
import { renderToBase64 } from '../../node/png.js';
import { requireCanvas, updateCanvas, setCanvasDirectly, inspectCanvas } from '../../core/canvas.js';
import { DEFAULT_SCALE, MAX_SCALE } from '../../core/constants.js';

export function register(server: McpServer): void {
  // --- palettes tool ---
  defineTool(server, 'palettes',
    'List palettes and their named slots. Palettes that share a schema (e.g. "scene") use each index for the same role, so swapping between them recolors the same art for a different mood.',
    {
      schema: z.string().optional().describe('Only palettes with this schema, e.g. "scene"'),
    },
    async ({ schema }) => {
      const lines = listPalettes()
        .map((id) => getPalette(id))
        .filter((p) => !schema || p.schema === schema)
        .map((p) => {
          const slots = slotNames(p).map((name, i) => `${i.toString(16).toUpperCase()}=${name}`).join(' ');
          return `${p.id}${p.schema ? ` [schema: ${p.schema}]` : ''}: ${p.name}\n  ${slots}`;
        });
      const text = lines.length ? lines.join('\n') : `No palettes with schema "${schema}".`;
      return { content: [{ type: 'text' as const, text }] };
    },
  );

  // --- repalette tool ---
  defineTool(server, 'repalette',
    'Switch a canvas to another palette. Within one schema the pixels stay and only the colors change; across schemas each color moves to the slot with the same name, or else the nearest color.',
    {
      canvas_id: z.string().describe('Canvas ID'),
      palette: z.string().describe('Target palette ID, e.g. "scene-dusk"'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Preview scale (default ${DEFAULT_SCALE})`),
    },
    async ({ canvas_id, palette, scale }) => {
      const canvas = requireCanvas(canvas_id);
      const to = findPalette(palette);
      if (!to) throw new Error(`Palette "${palette}" not found. Use the palettes tool to list them.`);
      const from = getPalette(canvas.palette);
      if (from.schema && from.schema === to.schema) {
        setCanvasDirectly(canvas_id, { ...canvas, palette: to.id });
      } else {
        updateCanvas(canvas_id, remapPalette(canvas.data, from, to));
        setCanvasDirectly(canvas_id, { ...requireCanvas(canvas_id), palette: to.id });
      }
      const updated = requireCanvas(canvas_id);
      const base64 = await renderToBase64(updated.data, to, scale);
      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: inspectCanvas(canvas_id, updated) },
        ],
      };
    },
  );
}
