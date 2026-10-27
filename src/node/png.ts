import sharp from 'sharp';

import type { Palette, SpriteData } from '../core/types.js';
import { renderToRGBA } from '../core/render.js';

/** Render sprite to PNG buffer */
export async function renderToBuffer(
  sprite: SpriteData,
  palette: Palette,
  scale?: number,
): Promise<Buffer> {
  const { width, height, data } = renderToRGBA(sprite, palette, scale);
  return sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/** Render sprite to PNG base64 string */
export async function renderToBase64(
  sprite: SpriteData,
  palette: Palette,
  scale?: number,
): Promise<string> {
  const buf = await renderToBuffer(sprite, palette, scale);
  return buf.toString('base64');
}
