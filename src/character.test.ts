import { describe, it, expect, beforeAll } from 'vitest';
import { hashSeed, selectIndex, generateCharacter, describeCharacter, loadCharacterAssets } from './character.js';
import { loadPalettes } from './palette.js';
import { loadIndex } from './store.js';

beforeAll(async () => {
  await Promise.all([loadPalettes(), loadIndex(), loadCharacterAssets()]);
});

describe('hashSeed', () => {
  it('returns consistent hash for same input', () => {
    expect(hashSeed('test')).toBe(hashSeed('test'));
  });

  it('returns different hashes for different inputs', () => {
    expect(hashSeed('hero')).not.toBe(hashSeed('villain'));
  });

  it('returns unsigned 32-bit integer', () => {
    const h = hashSeed('anything');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('selectIndex', () => {
  it('returns values in range', () => {
    const hash = hashSeed('test');
    for (let slot = 0; slot < 10; slot++) {
      const idx = selectIndex(hash, slot, 5);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
    }
  });

  it('different slots produce different selections', () => {
    const hash = hashSeed('variety');
    const results = new Set<number>();
    for (let slot = 0; slot < 10; slot++) {
      results.add(selectIndex(hash, slot, 100));
    }
    // With 10 slots and 100 options, we should get at least some variety
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('generateCharacter', () => {
  it('produces deterministic output for same seed', () => {
    const a = generateCharacter({ seed: 'warrior' });
    const b = generateCharacter({ seed: 'warrior' });
    expect(a.pixels).toEqual(b.pixels);
  });

  it('produces different output for different seeds', () => {
    const a = generateCharacter({ seed: 'mage' });
    const b = generateCharacter({ seed: 'rogue' });
    expect(a.pixels).not.toEqual(b.pixels);
  });

  it('respects explicit species option', () => {
    const desc = describeCharacter({ seed: 'test', species: 'dwarf' });
    expect(desc).toContain('dwarf');
  });

  it('returns 32x32 sprite', () => {
    const sprite = generateCharacter({ seed: 'size-test' });
    expect(sprite.width).toBe(32);
    expect(sprite.height).toBe(32);
    expect(sprite.pixels.length).toBe(32);
    expect(sprite.pixels[0].length).toBe(32);
  });
});

describe('describeCharacter', () => {
  it('returns human-readable description', () => {
    const desc = describeCharacter({ seed: 'hero' });
    expect(desc).toContain('armor');
    expect(desc).toContain('helm');
    expect(desc).toContain('skin tone');
  });
});
