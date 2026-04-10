import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { SpriteData } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

/** Load a sprite JSON file from the sprites directory */
export async function loadSprite(filePath: string): Promise<SpriteData> {
  const full = path.join(SPRITES_DIR, filePath);
  const raw = await fs.readFile(full, 'utf-8');
  return JSON.parse(raw);
}

/** Create an empty (transparent) sprite grid */
export function createEmpty(width: number, height: number): SpriteData {
  const pixels: number[][] = [];
  for (let y = 0; y < height; y++) {
    pixels.push(new Array(width).fill(-1));
  }
  return { width, height, pixels };
}

/** Flip a sprite horizontally */
export function flipH(sprite: SpriteData): SpriteData {
  return {
    width: sprite.width,
    height: sprite.height,
    pixels: sprite.pixels.map((row) => [...row].reverse()),
  };
}

/** Overlay a part sprite onto a base sprite at the given offset */
export function overlayPart(
  base: SpriteData,
  part: SpriteData,
  offsetX: number,
  offsetY: number,
): SpriteData {
  // Deep copy base pixels
  const pixels = base.pixels.map((row) => [...row]);

  for (let y = 0; y < part.height; y++) {
    const dy = y + offsetY;
    if (dy < 0 || dy >= base.height) continue;
    for (let x = 0; x < part.width; x++) {
      const dx = x + offsetX;
      if (dx < 0 || dx >= base.width) continue;
      const val = part.pixels[y]?.[x] ?? -1;
      if (val >= 0) {
        pixels[dy][dx] = val;
      }
    }
  }

  return { width: base.width, height: base.height, pixels };
}

/** Replace specific palette indices in a sprite */
export function recolorIndices(
  sprite: SpriteData,
  fromIndices: number[],
  toIndex: number,
): SpriteData {
  return {
    width: sprite.width,
    height: sprite.height,
    pixels: sprite.pixels.map((row) =>
      row.map((px) => (fromIndices.includes(px) ? toIndex : px)),
    ),
  };
}

/** Merge two sprites into a wider canvas (side by side) */
export function mergeHorizontal(left: SpriteData, right: SpriteData, gap: number = 0): SpriteData {
  const width = left.width + gap + right.width;
  const height = Math.max(left.height, right.height);
  const pixels: number[][] = [];

  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      if (x < left.width) {
        row.push(left.pixels[y]?.[x] ?? -1);
      } else if (x < left.width + gap) {
        row.push(-1);
      } else {
        const rx = x - left.width - gap;
        row.push(right.pixels[y]?.[rx] ?? -1);
      }
    }
    pixels.push(row);
  }

  return { width, height, pixels };
}
