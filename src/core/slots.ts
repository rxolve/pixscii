import type { Palette, SpriteData } from './types.js';
import { listPalettes, getPalette, resolveColor } from './palette.js';
import { nearestColorIndex } from './quantize.js';

/**
 * The "scene" schema: 16 named slots shared by the scene-* palettes (scene-dawn, scene-sea, ...).
 * Draw with these indices and any scene palette recolors the result.
 */
export const SCENE_SLOTS = [
  'ink', 'sky-top', 'sky-mid', 'sky-low', 'sun', 'cloud', 'far', 'mid',
  'near', 'ground', 'water', 'foam', 'accent', 'skin', 'cloth', 'light',
] as const;

export type SceneSlot = (typeof SCENE_SLOTS)[number];

/** Index of a scene slot, e.g. SCENE.ground === 9 */
export const SCENE = Object.fromEntries(SCENE_SLOTS.map((name, i) => [name, i])) as Record<SceneSlot, number>;

/** Slot names of a palette in index order */
export function slotNames(palette: Palette): string[] {
  return [...palette.colors].sort((a, b) => a.index - b.index).map((c) => c.name);
}

/** Index of a named slot in a palette. Throws when the palette has no slot by that name */
export function slotIndex(palette: Palette, name: string): number {
  const color = palette.colors.find((c) => c.name === name);
  if (!color) throw new Error(`Palette "${palette.id}" has no slot "${name}". Slots: ${slotNames(palette).join(', ')}`);
  return color.index;
}

/** Loaded palettes that share a schema, e.g. palettesWithSchema('scene') */
export function palettesWithSchema(schema: string): Palette[] {
  return listPalettes()
    .map((id) => getPalette(id))
    .filter((p) => p.schema === schema);
}

/**
 * Move art from one palette to another. Each index goes to the slot with the same name in `to`;
 * when `to` has no such name, to the nearest color. Within one schema this is the identity:
 * swap the palette at render time instead.
 */
export function remapPalette(sprite: SpriteData, from: Palette, to: Palette): SpriteData {
  const map = new Map<number, number>();
  for (const color of from.colors) {
    const same = to.colors.find((c) => c.name === color.name);
    if (same) {
      map.set(color.index, same.index);
    } else {
      const [r, g, b, a] = resolveColor(from, color.index);
      map.set(color.index, nearestColorIndex(r, g, b, a, to));
    }
  }
  return {
    width: sprite.width,
    height: sprite.height,
    pixels: sprite.pixels.map((row) => row.map((px) => (px < 0 ? px : (map.get(px) ?? px)))),
  };
}
