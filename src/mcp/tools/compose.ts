import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { composeScene } from '../compose.js';
import { buildTilemap } from '../tilemap.js';
import { getPalette } from '../palette.js';
import { renderToBase64 } from '../render.js';
import { storeCanvas, requireCanvas, inspectCanvas } from '../canvas.js';
import { mergeHorizontal, mergeVertical, mergeGrid } from '../sprite.js';
import { DEFAULT_SCALE, MAX_SCALE, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, MAX_COMPOSE_LAYERS, MAX_TILEMAP_COLS, MAX_TILEMAP_ROWS, MAX_SPRITESHEET_FRAMES } from '../constants.js';
import type { SpriteData } from '../types.js';

export function register(server: McpServer): void {
  // --- compose tool ---
  defineTool(server, 'compose',
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
    },
  );

  // --- tilemap tool ---
  defineTool(server, 'tilemap',
    'Build a tilemap from a 2D grid of tile IDs. Each cell becomes a 16x16 tile.',
    {
      grid: z.array(z.array(z.string())).min(1).max(MAX_TILEMAP_ROWS).describe('2D array of tile IDs (e.g. [["grass","grass","water"],["grass","door","grass"]])'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ grid, scale, palette: paletteId }) => {
      if (grid.some((row: string[]) => row.length > MAX_TILEMAP_COLS)) {
        return {
          content: [{ type: 'text' as const, text: `Max ${MAX_TILEMAP_COLS} columns per row` }],
          isError: true,
        };
      }

      const sprite = await buildTilemap(grid);
      const pal = getPalette(paletteId);
      const base64 = await renderToBase64(sprite, pal, scale);
      const canvasId = storeCanvas({ data: sprite, width: sprite.width, height: sprite.height, palette: pal.id, prev: null });
      const gridText = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\nTilemap: ${grid[0].length}x${grid.length} tiles (${sprite.width}x${sprite.height}px)\n\n${gridText}` },
        ],
      };
    },
  );

  // --- spritesheet tool ---
  defineTool(server, 'spritesheet',
    'Stitch multiple canvases into a single PNG spritesheet. Supports horizontal, vertical, or grid layout.',
    {
      frames: z.array(z.string()).min(1).max(MAX_SPRITESHEET_FRAMES).describe('Canvas IDs to stitch'),
      direction: z.enum(['horizontal', 'vertical', 'grid']).optional().describe('Layout direction (default "horizontal")'),
      columns: z.number().int().min(1).optional().describe('Columns for grid layout'),
      gap: z.number().int().min(0).max(8).optional().describe('Pixel gap between frames (default 0)'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ frames, direction, columns, gap, scale, palette: paletteId }) => {
      const pal = getPalette(paletteId);
      const sprites = frames.map((id: string) => requireCanvas(id).data);
      const dir = direction ?? 'horizontal';
      const g = gap ?? 0;

      let result: SpriteData;
      if (dir === 'horizontal') {
        result = sprites.reduce((acc: SpriteData, s: SpriteData) => mergeHorizontal(acc, s, g));
      } else if (dir === 'vertical') {
        result = mergeVertical(sprites, g);
      } else {
        if (!columns) {
          return { content: [{ type: 'text' as const, text: 'Error: "columns" is required for grid layout.' }], isError: true };
        }
        result = mergeGrid(sprites, columns, g);
      }

      const base64 = await renderToBase64(result, pal, scale);
      const canvasId = storeCanvas({ data: result, width: result.width, height: result.height, palette: pal.id, prev: null });
      const grid = inspectCanvas(canvasId, requireCanvas(canvasId));

      return {
        content: [
          { type: 'image' as const, data: base64, mimeType: 'image/png' as const },
          { type: 'text' as const, text: `canvas_id: ${canvasId}\nSpritesheet: ${frames.length} frames, ${dir}, ${result.width}x${result.height}px\n\n${grid}` },
        ],
      };
    },
  );
}
