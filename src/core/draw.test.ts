import { describe, it, expect } from 'vitest';
import { setPixels, drawLine, drawRect, floodFill, mirrorH } from './draw.js';
import { createEmpty } from './sprite.js';
import type { SpriteData } from './types.js';

function makeSprite(w: number, h: number, fill = -1): SpriteData {
  return {
    width: w,
    height: h,
    pixels: Array.from({ length: h }, () => new Array(w).fill(fill)),
  };
}

describe('setPixels', () => {
  it('sets pixels within bounds', () => {
    const s = makeSprite(4, 4);
    const r = setPixels(s, [
      { x: 0, y: 0, color: 1 },
      { x: 3, y: 3, color: 8 },
    ]);
    expect(r.pixels[0][0]).toBe(1);
    expect(r.pixels[3][3]).toBe(8);
  });

  it('skips out-of-bounds silently', () => {
    const s = makeSprite(4, 4);
    const r = setPixels(s, [
      { x: -1, y: 0, color: 1 },
      { x: 4, y: 0, color: 1 },
      { x: 0, y: 99, color: 1 },
    ]);
    // All pixels should still be -1
    for (const row of r.pixels) {
      for (const px of row) {
        expect(px).toBe(-1);
      }
    }
  });

  it('returns same sprite for empty coords', () => {
    const s = makeSprite(4, 4);
    const r = setPixels(s, []);
    expect(r).toBe(s);
  });

  it('supports transparent as color', () => {
    const s = makeSprite(4, 4, 5);
    const r = setPixels(s, [{ x: 1, y: 1, color: -1 }]);
    expect(r.pixels[1][1]).toBe(-1);
    expect(r.pixels[0][0]).toBe(5);
  });
});

describe('drawLine', () => {
  it('draws a horizontal line', () => {
    const s = makeSprite(8, 4);
    const r = drawLine(s, 1, 2, 6, 2, 7);
    for (let x = 1; x <= 6; x++) {
      expect(r.pixels[2][x]).toBe(7);
    }
    expect(r.pixels[2][0]).toBe(-1);
    expect(r.pixels[2][7]).toBe(-1);
  });

  it('draws a vertical line', () => {
    const s = makeSprite(4, 8);
    const r = drawLine(s, 2, 1, 2, 6, 3);
    for (let y = 1; y <= 6; y++) {
      expect(r.pixels[y][2]).toBe(3);
    }
    expect(r.pixels[0][2]).toBe(-1);
  });

  it('draws a single pixel when start equals end', () => {
    const s = makeSprite(4, 4);
    const r = drawLine(s, 2, 2, 2, 2, 5);
    expect(r.pixels[2][2]).toBe(5);
    let count = 0;
    for (const row of r.pixels) for (const px of row) if (px >= 0) count++;
    expect(count).toBe(1);
  });

  it('draws a diagonal line', () => {
    const s = makeSprite(8, 8);
    const r = drawLine(s, 0, 0, 7, 7, 1);
    // Diagonal: every (i, i) should be set
    for (let i = 0; i < 8; i++) {
      expect(r.pixels[i][i]).toBe(1);
    }
  });

  it('clips line partially off-canvas', () => {
    const s = makeSprite(4, 4);
    const r = drawLine(s, -2, 2, 6, 2, 8);
    // Only pixels 0-3 on row 2 should be set
    for (let x = 0; x < 4; x++) {
      expect(r.pixels[2][x]).toBe(8);
    }
  });
});

describe('drawRect', () => {
  it('draws an outline rectangle', () => {
    const s = makeSprite(8, 8);
    const r = drawRect(s, 1, 1, 4, 4, 1, false);
    // Edges
    expect(r.pixels[1][1]).toBe(1);
    expect(r.pixels[1][4]).toBe(1);
    expect(r.pixels[4][1]).toBe(1);
    expect(r.pixels[4][4]).toBe(1);
    // Interior should be empty
    expect(r.pixels[2][2]).toBe(-1);
    expect(r.pixels[3][3]).toBe(-1);
  });

  it('draws a filled rectangle', () => {
    const s = makeSprite(8, 8);
    const r = drawRect(s, 2, 2, 3, 3, 8, true);
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        expect(r.pixels[y][x]).toBe(8);
      }
    }
  });

  it('draws a 1x1 rect as single pixel', () => {
    const s = makeSprite(4, 4);
    const r = drawRect(s, 1, 1, 1, 1, 5, false);
    expect(r.pixels[1][1]).toBe(5);
    let count = 0;
    for (const row of r.pixels) for (const px of row) if (px >= 0) count++;
    expect(count).toBe(1);
  });

  it('clips rect partially off-canvas', () => {
    const s = makeSprite(4, 4);
    const r = drawRect(s, -1, -1, 3, 3, 2, true);
    // Only pixels at (0,0), (1,0), (0,1), (1,1) should be set
    expect(r.pixels[0][0]).toBe(2);
    expect(r.pixels[0][1]).toBe(2);
    expect(r.pixels[1][0]).toBe(2);
    expect(r.pixels[1][1]).toBe(2);
    expect(r.pixels[2][0]).toBe(-1);
  });
});

describe('floodFill', () => {
  it('fills an enclosed region', () => {
    // 6x6 box with a 4x4 hollow interior
    const s = makeSprite(6, 6);
    // Draw border
    for (let i = 0; i < 6; i++) {
      s.pixels[0][i] = 1; // top
      s.pixels[5][i] = 1; // bottom
      s.pixels[i][0] = 1; // left
      s.pixels[i][5] = 1; // right
    }
    const { result, count, leaked } = floodFill(s, 3, 3, 8);
    expect(count).toBe(16); // 4x4 interior
    expect(leaked).toBe(false);
    expect(result.pixels[3][3]).toBe(8);
    expect(result.pixels[0][0]).toBe(1); // border unchanged
  });

  it('returns count 0 when filling same color', () => {
    const s = makeSprite(4, 4, 5);
    const { count } = floodFill(s, 2, 2, 5);
    expect(count).toBe(0);
  });

  it('detects leak when fill reaches canvas edge', () => {
    const s = makeSprite(8, 8); // all transparent
    const { leaked } = floodFill(s, 4, 4, 3);
    expect(leaked).toBe(true);
  });

  it('returns no-op for out-of-bounds start', () => {
    const s = makeSprite(4, 4);
    const { result, count } = floodFill(s, -1, -1, 1);
    expect(count).toBe(0);
    expect(result).toBe(s);
  });
});

describe('mirrorH', () => {
  it('mirrors left half to right half', () => {
    const s = makeSprite(4, 2);
    s.pixels[0][0] = 1;
    s.pixels[0][1] = 2;
    s.pixels[1][0] = 3;
    s.pixels[1][1] = 4;
    const r = mirrorH(s);
    // Right side should mirror left
    expect(r.pixels[0][3]).toBe(1);
    expect(r.pixels[0][2]).toBe(2);
    expect(r.pixels[1][3]).toBe(3);
    expect(r.pixels[1][2]).toBe(4);
  });

  it('mirrors with explicit axis', () => {
    const s = makeSprite(6, 1);
    s.pixels[0] = [1, 2, 3, -1, -1, -1];
    const r = mirrorH(s, 3);
    expect(r.pixels[0]).toEqual([1, 2, 3, 3, 2, 1]);
  });

  it('handles odd-width canvas (center unchanged)', () => {
    const s = makeSprite(5, 1);
    s.pixels[0] = [1, 2, 9, -1, -1];
    const r = mirrorH(s);
    // axis = floor(5/2) = 2, mirrors indices 0,1 to 4,3
    expect(r.pixels[0][2]).toBe(9); // center unchanged
    expect(r.pixels[0][4]).toBe(1);
    expect(r.pixels[0][3]).toBe(2);
  });
});
