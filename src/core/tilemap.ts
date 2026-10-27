import type { SpriteData } from './types.js';
import { getById, loadSpriteData } from './store.js';
import { createEmpty, overlayPart } from './sprite.js';
import { getCanvas } from './canvas.js';

/** Build a tilemap from a 2D grid of sprite IDs */
export async function buildTilemap(grid: string[][]): Promise<SpriteData> {
  if (grid.length === 0 || grid[0].length === 0) {
    throw new Error('Tilemap grid must not be empty');
  }

  const rows = grid.length;
  const cols = grid[0].length;

  // Detect tile size from first non-empty tile
  let tileW = 16;
  let tileH = 16;
  outer: for (const row of grid) {
    for (const id of row) {
      if (!id || id === '' || id === 'empty') continue;
      const cv = getCanvas(id);
      if (cv) { tileW = cv.data.width; tileH = cv.data.height; break outer; }
      const entry = getById(id);
      if (entry) { tileW = entry.width; tileH = entry.height; break outer; }
    }
  }

  const width = cols * tileW;
  const height = rows * tileH;

  let canvas = createEmpty(width, height);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = grid[row][col];
      if (!id || id === '' || id === 'empty') continue;

      let sprite: SpriteData;

      // 1. Check canvas store first
      const cv = getCanvas(id);
      if (cv) {
        sprite = cv.data;
      } else {
        // 2. Check sprite index
        const entry = getById(id);
        if (!entry) throw new Error(`Tile "${id}" not found`);
        sprite = await loadSpriteData(entry);
      }

      canvas = overlayPart(canvas, sprite, col * tileW, row * tileH);
    }
  }

  return canvas;
}
