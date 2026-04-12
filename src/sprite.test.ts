import { describe, it, expect } from 'vitest';
import { mergeVertical, mergeGrid, mergeHorizontal } from './sprite.js';
import type { SpriteData } from './types.js';

function make(w: number, h: number, fill = -1): SpriteData {
  return {
    width: w,
    height: h,
    pixels: Array.from({ length: h }, () => new Array(w).fill(fill)),
  };
}

describe('mergeVertical', () => {
  it('stacks two same-size sprites', () => {
    const a = make(4, 3, 1);
    const b = make(4, 3, 2);
    const r = mergeVertical([a, b]);
    expect(r.width).toBe(4);
    expect(r.height).toBe(6);
    expect(r.pixels[0][0]).toBe(1);
    expect(r.pixels[3][0]).toBe(2);
  });

  it('handles different widths (max width, left-aligned)', () => {
    const a = make(6, 2, 1);
    const b = make(3, 2, 2);
    const r = mergeVertical([a, b]);
    expect(r.width).toBe(6);
    expect(r.height).toBe(4);
    expect(r.pixels[2][0]).toBe(2);
    expect(r.pixels[2][3]).toBe(-1); // narrow sprite, right side transparent
  });

  it('adds gap between sprites', () => {
    const a = make(4, 2, 1);
    const b = make(4, 2, 2);
    const r = mergeVertical([a, b], 1);
    expect(r.height).toBe(5); // 2 + 1 + 2
    expect(r.pixels[2][0]).toBe(-1); // gap row
    expect(r.pixels[3][0]).toBe(2);
  });

  it('single sprite returns same', () => {
    const a = make(4, 4, 5);
    const r = mergeVertical([a]);
    expect(r).toBe(a);
  });

  it('empty array returns 0x0', () => {
    const r = mergeVertical([]);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe('mergeGrid', () => {
  it('4 sprites, 2 columns → 2x2 grid', () => {
    const sprites = [make(4, 4, 1), make(4, 4, 2), make(4, 4, 3), make(4, 4, 4)];
    const r = mergeGrid(sprites, 2);
    expect(r.width).toBe(8);
    expect(r.height).toBe(8);
    expect(r.pixels[0][0]).toBe(1); // top-left
    expect(r.pixels[0][4]).toBe(2); // top-right
    expect(r.pixels[4][0]).toBe(3); // bottom-left
    expect(r.pixels[4][4]).toBe(4); // bottom-right
  });

  it('3 sprites, 2 columns → incomplete last row', () => {
    const sprites = [make(4, 4, 1), make(4, 4, 2), make(4, 4, 3)];
    const r = mergeGrid(sprites, 2);
    expect(r.width).toBe(8);
    expect(r.height).toBe(8);
    expect(r.pixels[4][0]).toBe(3);
    // no 4th sprite, right side of second row should be transparent
    // (mergeHorizontal of single element = just that element, so width may be 4 not 8 for last row)
  });

  it('columns >= count → single row', () => {
    const sprites = [make(4, 4, 1), make(4, 4, 2)];
    const r = mergeGrid(sprites, 5);
    expect(r.width).toBe(8);
    expect(r.height).toBe(4);
  });

  it('columns=1 → same as vertical', () => {
    const sprites = [make(4, 3, 1), make(4, 3, 2)];
    const r = mergeGrid(sprites, 1);
    expect(r.width).toBe(4);
    expect(r.height).toBe(6);
  });

  it('empty array returns 0x0', () => {
    const r = mergeGrid([], 2);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});
