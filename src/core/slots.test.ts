import { describe, it, expect, beforeAll } from 'vitest';
import { loadPalettes, getPalette } from './palette.js';
import { SCENE, SCENE_SLOTS, slotIndex, slotNames, palettesWithSchema, remapPalette } from './slots.js';
import type { SpriteData } from './types.js';

beforeAll(async () => {
  await loadPalettes();
});

describe('scene palettes', () => {
  it('ship ten moods that all follow the scene schema', () => {
    const scenes = palettesWithSchema('scene');
    expect(scenes.map((p) => p.id).sort()).toEqual(
      ['dawn', 'dusk', 'forest', 'home', 'night', 'school', 'sea', 'stars', 'storm', 'window'].map((m) => `scene-${m}`),
    );
    for (const p of scenes) expect(slotNames(p)).toEqual([...SCENE_SLOTS]);
  });

  it('name slots by index', () => {
    expect(SCENE.ground).toBe(9);
    expect(slotIndex(getPalette('scene-sea'), 'water')).toBe(SCENE.water);
    expect(() => slotIndex(getPalette('pico8'), 'water')).toThrow(/no slot "water"/);
  });
});

describe('remapPalette', () => {
  const art: SpriteData = { width: 3, height: 1, pixels: [[SCENE['sky-top'], -1, SCENE.ground]] };

  it('keeps indices within one schema', () => {
    expect(remapPalette(art, getPalette('scene-dawn'), getPalette('scene-dusk')).pixels).toEqual(art.pixels);
  });

  it('falls back to the nearest color across schemas, keeping transparency', () => {
    const out = remapPalette(art, getPalette('scene-stars'), getPalette('grayscale'));
    expect(out.pixels[0][1]).toBe(-1);
    expect(out.pixels[0][0]).toBe(1); // #07070F sky is nearest to grey-1 (#111111), not black
  });
});
