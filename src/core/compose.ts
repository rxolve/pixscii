import type { SpriteData } from './types.js';
import { loadSprite, overlayPart, createEmpty } from './sprite.js';
import { getById, loadSpriteData } from './store.js';
import { getCanvas } from './canvas.js';

export interface ComposeLayer {
  sprite: string;
  x: number;
  y: number;
}

/** Compose multiple sprites onto a canvas */
export async function composeScene(
  layers: ComposeLayer[],
  width: number,
  height: number,
): Promise<SpriteData> {
  let canvas = createEmpty(width, height);

  for (const layer of layers) {
    let sprite: SpriteData;

    // 1. Check canvas store first
    const cv = getCanvas(layer.sprite);
    if (cv) {
      sprite = cv.data;
    } else {
      // 2. Check sprite index
      const entry = getById(layer.sprite);
      if (entry) {
        sprite = await loadSpriteData(entry);
      } else {
        // 3. Fallback to file
        sprite = await loadSprite(`${layer.sprite}.json`).catch(() => {
          throw new Error(`Sprite "${layer.sprite}" not found`);
        });
      }
    }

    canvas = overlayPart(canvas, sprite, layer.x, layer.y);
  }

  return canvas;
}
