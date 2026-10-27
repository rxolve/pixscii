import sharp from 'sharp';

import type { SpriteData, Palette } from '../core/types.js';
import { quantizeRGBA } from '../core/quantize.js';

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

  return quantizeRGBA(data, info.width, info.height, palette);
}
