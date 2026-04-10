import type { SpriteData } from './types.js';
import { getById, loadSpriteData } from './store.js';
import { createEmpty, overlayPart } from './sprite.js';

/** Build a tilemap from a 2D grid of sprite IDs */
export async function buildTilemap(grid: string[][]): Promise<SpriteData> {
  if (grid.length === 0 || grid[0].length === 0) {
    throw new Error('Tilemap grid must not be empty');
  }

  const rows = grid.length;
  const cols = grid[0].length;

  // Assume all tiles are 16×16
  const tileW = 16;
  const tileH = 16;
  const width = cols * tileW;
  const height = rows * tileH;

  let canvas = createEmpty(width, height);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = grid[row][col];
      if (!id || id === '' || id === 'empty') continue;

      const entry = getById(id);
      if (!entry) throw new Error(`Tile "${id}" not found in sprite index`);

      const sprite = await loadSpriteData(entry);
      canvas = overlayPart(canvas, sprite, col * tileW, row * tileH);
    }
  }

  return canvas;
}
