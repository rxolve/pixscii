import { describe, it, expect } from 'vitest';
import { creature, being, CREATURE_KINDS, BEING_SPECIES, LIFE_STAGES } from './creature.js';
import { SCENE } from './slots.js';

const flat = (p: number[][]) => p.flat();

describe('creature', () => {
  it('is deterministic per seed and kind, and varies with the seed', () => {
    for (const kind of CREATURE_KINDS) {
      expect(creature({ seed: 'a', kind }).pixels).toEqual(creature({ seed: 'a', kind }).pixels);
      expect(creature({ seed: 'a', kind }).pixels).not.toEqual(creature({ seed: 'b', kind }).pixels);
    }
  });

  it('mirrors masked kinds left to right', () => {
    for (const kind of ['robot', 'alien', 'critter'] as const) {
      for (let seed = 0; seed < 5; seed++) {
        const art = creature({ seed, kind });
        for (const row of art.pixels) expect(row).toEqual([...row].reverse());
      }
    }
  });

  it('outlines every body pixel that touches the outside', () => {
    const art = creature({ seed: 3, kind: 'robot' });
    const at = (x: number, y: number) => art.pixels[y]?.[x] ?? -1;
    for (let y = 0; y < art.height; y++) {
      for (let x = 0; x < art.width; x++) {
        if (at(x, y) < 0) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = at(x + dx, y + dy);
            expect(n === -1 || n === SCENE.ink).toBe(true);
          }
        }
      }
    }
  });

  it('honors size and rejects odd sizes', () => {
    expect(creature({ seed: 1, kind: 'nebula', size: 32 }).width).toBe(32);
    expect(() => creature({ seed: 1, size: 25 })).toThrow(/even/);
  });
});

describe('being', () => {
  it('draws every species at every stage on a 24×24 transparent canvas', () => {
    for (const species of BEING_SPECIES) {
      const stages = LIFE_STAGES.map((stage) => being({ species, stage }));
      for (const art of stages) {
        expect(art.width).toBe(24);
        expect(art.pixels[0][0]).toBe(-1);
        expect(flat(art.pixels)).toContain(SCENE.ink);
        expect(flat(art.pixels).filter((p) => p >= 0).length).toBeGreaterThan(40);
      }
      expect(stages[0].pixels).not.toEqual(stages[1].pixels);
      expect(stages[1].pixels).not.toEqual(stages[2].pixels);
    }
  });

  it('gives old people white hair and babies no legs', () => {
    expect(flat(being({ species: 'human', stage: 'old' }).pixels)).toContain(SCENE.light);
    const baby = being({ species: 'human', stage: 'baby' });
    expect(flat(baby.pixels.slice(22))).not.toContain(SCENE.near);
  });
});
