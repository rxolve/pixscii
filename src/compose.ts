import type { SpriteData } from './types.js';
import { loadSprite, overlayPart, createEmpty } from './sprite.js';
import { getById, loadSpriteData } from './store.js';

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
    const entry = getById(layer.sprite);
    let sprite: SpriteData;
    if (entry) {
      sprite = await loadSpriteData(entry);
    } else {
      sprite = await loadSprite(`${layer.sprite}.json`).catch(() => {
        throw new Error(`Sprite "${layer.sprite}" not found`);
      });
    }
    canvas = overlayPart(canvas, sprite, layer.x, layer.y);
  }

  return canvas;
}
