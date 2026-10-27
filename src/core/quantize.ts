import type { SpriteData, Palette } from './types.js';
import { resolveColor } from './palette.js';

/** Find nearest palette color by Euclidean distance in RGB space */
export function nearestColorIndex(r: number, g: number, b: number, a: number, palette: Palette): number {
  if (a < 128) return -1; // transparent

  let bestIdx = 0;
  let bestDist = Infinity;

  for (const color of palette.colors) {
    const [cr, cg, cb] = resolveColor(palette, color.index);
    const dr = r - cr;
    const dg = g - cg;
    const db = b - cb;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = color.index;
    }
  }

  return bestIdx;
}

/** Quantize raw RGBA pixels (already at the target size) to palette indices */
export function quantizeRGBA(data: ArrayLike<number>, width: number, height: number, palette: Palette): SpriteData {
  const pixels: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      row.push(nearestColorIndex(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], palette));
    }
    pixels.push(row);
  }
  return { width, height, pixels };
}
