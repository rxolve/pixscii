import sharp from 'sharp';

import type { SpriteData, Palette, RGBA } from './types.js';
import { resolveColor } from './palette.js';

/** Find nearest palette color by Euclidean distance in RGB space */
function nearestColorIndex(r: number, g: number, b: number, a: number, palette: Palette): number {
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

/** Convert an image buffer to a pixel art sprite by quantizing to the given palette */
export async function quantizeToSprite(
  imageBuffer: Buffer,
  palette: Palette,
  targetWidth?: number,
  targetHeight?: number,
): Promise<SpriteData> {
  const w = targetWidth ?? 16;
  const h = targetHeight ?? 16;

  // Resize to target dimensions using nearest-neighbor for sharp pixel look
  const { data, info } = await sharp(imageBuffer)
    .resize(w, h, { fit: 'fill', kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: number[][] = [];

  for (let y = 0; y < info.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      row.push(nearestColorIndex(r, g, b, a, palette));
    }
    pixels.push(row);
  }

  return { width: info.width, height: info.height, pixels };
}
