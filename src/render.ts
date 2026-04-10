import sharp from 'sharp';

import type { Palette, RGBA, SpriteData } from './types.js';
import { resolveColor } from './palette.js';
import { DEFAULT_SCALE, MAX_SCALE } from './constants.js';

/** Expand sprite pixel indices to RGBA buffer */
export function expandToRGBA(sprite: SpriteData, palette: Palette): Buffer {
  const { width, height, pixels } = sprite;
  const buf = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    for (let x = 0; x < width; x++) {
      const idx = row?.[x] ?? -1;
      const offset = (y * width + x) * 4;
      if (idx < 0) {
        // transparent
        buf[offset] = 0;
        buf[offset + 1] = 0;
        buf[offset + 2] = 0;
        buf[offset + 3] = 0;
      } else {
        const [r, g, b, a] = resolveColor(palette, idx);
        buf[offset] = r;
        buf[offset + 1] = g;
        buf[offset + 2] = b;
        buf[offset + 3] = a;
      }
    }
  }

  return buf;
}

/** Scale RGBA buffer using nearest-neighbor interpolation */
export function scaleNearestNeighbor(
  buf: Buffer,
  srcWidth: number,
  srcHeight: number,
  scale: number,
): Buffer {
  const dstWidth = srcWidth * scale;
  const dstHeight = srcHeight * scale;
  const dst = Buffer.alloc(dstWidth * dstHeight * 4);

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = Math.floor(dy / scale);
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = Math.floor(dx / scale);
      const srcOffset = (sy * srcWidth + sx) * 4;
      const dstOffset = (dy * dstWidth + dx) * 4;
      dst[dstOffset] = buf[srcOffset];
      dst[dstOffset + 1] = buf[srcOffset + 1];
      dst[dstOffset + 2] = buf[srcOffset + 2];
      dst[dstOffset + 3] = buf[srcOffset + 3];
    }
  }

  return dst;
}

/** Render sprite to PNG base64 string */
export async function renderToBase64(
  sprite: SpriteData,
  palette: Palette,
  scale?: number,
): Promise<string> {
  const s = Math.max(1, Math.min(scale ?? DEFAULT_SCALE, MAX_SCALE));
  const rgba = expandToRGBA(sprite, palette);
  const scaled = s === 1 ? rgba : scaleNearestNeighbor(rgba, sprite.width, sprite.height, s);
  const width = sprite.width * s;
  const height = sprite.height * s;

  const png = await sharp(scaled, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return png.toString('base64');
}

/** Render sprite to PNG buffer (for spritesheet assembly) */
export async function renderToBuffer(
  sprite: SpriteData,
  palette: Palette,
  scale?: number,
): Promise<Buffer> {
  const s = Math.max(1, Math.min(scale ?? DEFAULT_SCALE, MAX_SCALE));
  const rgba = expandToRGBA(sprite, palette);
  const scaled = s === 1 ? rgba : scaleNearestNeighbor(rgba, sprite.width, sprite.height, s);
  const width = sprite.width * s;
  const height = sprite.height * s;

  return sharp(scaled, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}
