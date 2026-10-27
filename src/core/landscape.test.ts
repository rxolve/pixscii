import { describe, it, expect } from 'vitest';
import { landscape, LANDSCAPE_PRESETS } from './landscape.js';
import { SCENE } from './slots.js';

const flat = (p: number[][]) => p.flat();

describe('landscape', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = landscape({ seed: 'light-a-soul', preset: 'dusk' });
    const b = landscape({ seed: 'light-a-soul', preset: 'dusk' });
    const c = landscape({ seed: 'another-life', preset: 'dusk' });
    expect(a.pixels).toEqual(b.pixels);
    expect(a.pixels).not.toEqual(c.pixels);
  });

  it('fills the whole canvas with scene slots only', () => {
    for (const preset of Object.keys(LANDSCAPE_PRESETS)) {
      const art = landscape({ seed: 1, preset });
      expect(art.width).toBe(128);
      expect(art.height).toBe(72);
      expect(flat(art.pixels).every((p) => p >= 0 && p <= 15)).toBe(true);
    }
  });

  it('puts water below the horizon when there is a sea', () => {
    const art = landscape({ seed: 3, layers: ['sky', 'sea'], horizon: 0.5 });
    const below = flat(art.pixels.slice(40));
    expect(below.filter((p) => p === SCENE.water || p === SCENE.near || p === SCENE.foam).length).toBe(below.length);
    expect(flat(art.pixels.slice(0, 30)).some((p) => p === SCENE.water)).toBe(false);
  });

  it('shows stars only at night and a sun only when asked', () => {
    const night = landscape({ seed: 5, preset: 'stars' });
    expect(flat(night.pixels)).toContain(SCENE.light);
    const day = landscape({ seed: 5, layers: ['sky', 'hills'], time: 'noon' });
    expect(flat(day.pixels)).not.toContain(SCENE.sun);
  });

  it('honors size and rejects unknown presets', () => {
    expect(landscape({ seed: 1, width: 64, height: 36 }).pixels[35].length).toBe(64);
    expect(() => landscape({ seed: 1, preset: 'moon' })).toThrow(/Unknown preset/);
  });
});
