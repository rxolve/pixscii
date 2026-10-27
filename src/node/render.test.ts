import { describe, it, expect, beforeAll } from 'vitest';
import { expandToRGBA, scaleNearestNeighbor, renderToBase64 } from './render.js';
import { loadPalettes, getPalette } from './palette.js';
import type { SpriteData, Palette } from './types.js';

let palette: Palette;

beforeAll(async () => {
  await loadPalettes();
  palette = getPalette('pico8');
});

describe('expandToRGBA', () => {
  it('converts a 2x2 sprite to RGBA buffer', () => {
    const sprite: SpriteData = {
      width: 2,
      height: 2,
      pixels: [
        [0, 7],
        [8, -1],
      ],
    };
    const buf = expandToRGBA(sprite, palette);
    expect(buf.length).toBe(2 * 2 * 4);
    // pixel (0,0) = index 0 = black = [0,0,0,255]
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
    expect(buf[3]).toBe(255);
    // pixel (1,1) = index -1 = transparent
    expect(buf[15]).toBe(0); // alpha
  });
});

describe('scaleNearestNeighbor', () => {
  it('scales a 2x2 buffer by 2x to 4x4', () => {
    const buf = Buffer.from([
      1, 2, 3, 255, 4, 5, 6, 255,
      7, 8, 9, 255, 10, 11, 12, 255,
    ]);
    const scaled = scaleNearestNeighbor(buf, 2, 2, 2);
    expect(scaled.length).toBe(4 * 4 * 4);
    // Top-left pixel should be repeated 4 times in the 2x2 block
    expect(scaled[0]).toBe(1);
    expect(scaled[4]).toBe(1); // (1,0) = same pixel
  });
});

describe('renderToBase64', () => {
  it('renders a small sprite to valid base64 PNG', async () => {
    const sprite: SpriteData = {
      width: 4,
      height: 4,
      pixels: [
        [0, 0, 0, 0],
        [0, 8, 8, 0],
        [0, 8, 8, 0],
        [0, 0, 0, 0],
      ],
    };
    const base64 = await renderToBase64(sprite, palette, 1);
    expect(base64.length).toBeGreaterThan(0);
    // Verify it's valid base64
    const buf = Buffer.from(base64, 'base64');
    // PNG magic bytes
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });
});
