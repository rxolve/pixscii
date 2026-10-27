import type { Palette, SpriteData } from './types.js';
import { resolveColor } from './palette.js';
import { DEFAULT_SCALE, MAX_SCALE } from './constants.js';

/** Raw RGBA pixels, 4 bytes per pixel, row by row (same layout as browser ImageData) */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Expand sprite pixel indices to RGBA buffer */
export function expandToRGBA(sprite: SpriteData, palette: Palette): Uint8Array {
  const { width, height, pixels } = sprite;
  const buf = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    for (let x = 0; x < width; x++) {
      const idx = row?.[x] ?? -1;
      const offset = (y * width + x) * 4;
      if (idx < 0) continue; // transparent: already zero
      const [r, g, b, a] = resolveColor(palette, idx);
      buf[offset] = r;
      buf[offset + 1] = g;
      buf[offset + 2] = b;
      buf[offset + 3] = a;
    }
  }

  return buf;
}

/** Scale RGBA buffer using nearest-neighbor interpolation */
export function scaleNearestNeighbor(
  buf: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  scale: number,
): Uint8Array {
  const dstWidth = srcWidth * scale;
  const dstHeight = srcHeight * scale;
  const dst = new Uint8Array(dstWidth * dstHeight * 4);

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

/** Render a sprite to scaled RGBA pixels. In a browser, wrap `data` in ImageData and put it on a canvas */
export function renderToRGBA(sprite: SpriteData, palette: Palette, scale?: number): RGBAImage {
  const s = Math.max(1, Math.min(scale ?? DEFAULT_SCALE, MAX_SCALE));
  const rgba = expandToRGBA(sprite, palette);
  return {
    width: sprite.width * s,
    height: sprite.height * s,
    data: s === 1 ? rgba : scaleNearestNeighbor(rgba, sprite.width, sprite.height, s),
  };
}
