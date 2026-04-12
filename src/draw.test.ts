import { describe, it, expect } from 'vitest';
import { setPixels, drawLine, drawRect, floodFill, mirrorH, copyRegion, shiftSprite, resizeSprite } from './draw.js';
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

describe('copyRegion', () => {
  it('copies an entire small source into a destination', () => {
    const src = makeSprite(2, 2);
    src.pixels = [[1, 2], [3, 4]];
    const dst = makeSprite(4, 4);
    const r = copyRegion(src, dst, { dx: 1, dy: 1 });
    expect(r.pixels[1][1]).toBe(1);
    expect(r.pixels[1][2]).toBe(2);
    expect(r.pixels[2][1]).toBe(3);
    expect(r.pixels[2][2]).toBe(4);
    // Uncovered destination pixels remain transparent.
    expect(r.pixels[0][0]).toBe(-1);
  });

  it('copies a sub-region when sx/sy/w/h are specified', () => {
    const src = makeSprite(4, 4);
    src.pixels = [
      [0, 0, 0, 0],
      [0, 1, 2, 0],
      [0, 3, 4, 0],
      [0, 0, 0, 0],
    ];
    const dst = makeSprite(4, 4);
    const r = copyRegion(src, dst, { sx: 1, sy: 1, w: 2, h: 2, dx: 0, dy: 0 });
    expect(r.pixels[0][0]).toBe(1);
    expect(r.pixels[0][1]).toBe(2);
    expect(r.pixels[1][0]).toBe(3);
    expect(r.pixels[1][1]).toBe(4);
  });

  it('skips transparent source pixels by default', () => {
    const src = makeSprite(2, 2);
    src.pixels = [[-1, 5], [5, -1]];
    const dst = makeSprite(2, 2, 9);
    const r = copyRegion(src, dst, { dx: 0, dy: 0 });
    expect(r.pixels[0][0]).toBe(9); // transparent skipped
    expect(r.pixels[0][1]).toBe(5);
    expect(r.pixels[1][0]).toBe(5);
    expect(r.pixels[1][1]).toBe(9); // transparent skipped
  });

  it('overwrites transparent source pixels when include_transparent is true', () => {
    const src = makeSprite(2, 2);
    src.pixels = [[-1, 5], [5, -1]];
    const dst = makeSprite(2, 2, 9);
    const r = copyRegion(src, dst, { dx: 0, dy: 0, includeTransparent: true });
    expect(r.pixels[0][0]).toBe(-1);
    expect(r.pixels[1][1]).toBe(-1);
  });

  it('clips destination writes to bounds', () => {
    const src = makeSprite(2, 2);
    src.pixels = [[1, 2], [3, 4]];
    const dst = makeSprite(2, 2);
    const r = copyRegion(src, dst, { dx: 1, dy: 1 });
    // Only (1,1) gets src[0][0] = 1; the rest of the region goes off-canvas.
    expect(r.pixels[1][1]).toBe(1);
    expect(r.pixels[0][0]).toBe(-1);
  });

  it('does not mutate the source', () => {
    const src = makeSprite(2, 2);
    src.pixels = [[1, 2], [3, 4]];
    const dst = makeSprite(2, 2);
    copyRegion(src, dst, { dx: 0, dy: 0 });
    expect(src.pixels).toEqual([[1, 2], [3, 4]]);
  });

  it('self-copy with overlap reads the original region, not the partially written result', () => {
    // A horizontal shift: copy src[0..3, 0] onto src[1..4, 0].
    // If the write aliased the read we'd get a smear; the buffered copy must not.
    const s = makeSprite(4, 1);
    s.pixels[0] = [1, 2, 3, 4];
    const r = copyRegion(s, s, { sx: 0, sy: 0, w: 3, h: 1, dx: 1, dy: 0 });
    expect(r.pixels[0]).toEqual([1, 1, 2, 3]);
  });
});

describe('shiftSprite', () => {
  it('shifts right, leaving new left column transparent', () => {
    const s = makeSprite(4, 1);
    s.pixels[0] = [1, 2, 3, 4];
    const r = shiftSprite(s, 1, 0, false);
    expect(r.pixels[0]).toEqual([-1, 1, 2, 3]);
  });

  it('shifts down, clearing top row', () => {
    const s = makeSprite(1, 3);
    s.pixels = [[1], [2], [3]];
    const r = shiftSprite(s, 0, 1, false);
    expect(r.pixels.map((row) => row[0])).toEqual([-1, 1, 2]);
  });

  it('wraps around with wrap=true (horizontal)', () => {
    const s = makeSprite(4, 1);
    s.pixels[0] = [1, 2, 3, 4];
    const r = shiftSprite(s, 1, 0, true);
    expect(r.pixels[0]).toEqual([4, 1, 2, 3]);
  });

  it('wraps with negative shift', () => {
    const s = makeSprite(4, 1);
    s.pixels[0] = [1, 2, 3, 4];
    const r = shiftSprite(s, -1, 0, true);
    expect(r.pixels[0]).toEqual([2, 3, 4, 1]);
  });

  it('no-op for (0,0) shift', () => {
    const s = makeSprite(3, 3);
    s.pixels[1][1] = 5;
    const r = shiftSprite(s, 0, 0, false);
    expect(r.pixels[1][1]).toBe(5);
  });

  it('shifting beyond canvas clears entire non-wrap result', () => {
    const s = makeSprite(3, 3);
    s.pixels[1][1] = 5;
    const r = shiftSprite(s, 10, 0, false);
    for (const row of r.pixels) for (const px of row) expect(px).toBe(-1);
  });
});

describe('resizeSprite', () => {
  it('extends with transparent padding when growing', () => {
    const s = makeSprite(2, 2);
    s.pixels = [[1, 2], [3, 4]];
    const r = resizeSprite(s, 4, 4, 0, 0);
    expect(r.width).toBe(4);
    expect(r.height).toBe(4);
    expect(r.pixels[0][0]).toBe(1);
    expect(r.pixels[1][1]).toBe(4);
    // New area is transparent.
    expect(r.pixels[2][2]).toBe(-1);
    expect(r.pixels[3][3]).toBe(-1);
  });

  it('crops when shrinking', () => {
    const s = makeSprite(4, 4);
    s.pixels = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
    const r = resizeSprite(s, 2, 2, 0, 0);
    expect(r.pixels).toEqual([[1, 2], [5, 6]]);
  });

  it('centers old content with positive offset', () => {
    const s = makeSprite(2, 2);
    s.pixels = [[1, 2], [3, 4]];
    const r = resizeSprite(s, 4, 4, 1, 1);
    expect(r.pixels[0][0]).toBe(-1);
    expect(r.pixels[1][1]).toBe(1);
    expect(r.pixels[2][2]).toBe(4);
    expect(r.pixels[3][3]).toBe(-1);
  });

  it('negative offset crops from top-left', () => {
    const s = makeSprite(4, 4);
    s.pixels = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
    const r = resizeSprite(s, 2, 2, -1, -1);
    // New (0,0) reads from old (1,1), etc.
    expect(r.pixels).toEqual([[6, 7], [10, 11]]);
  });

  it('does not mutate the source', () => {
    const s = makeSprite(2, 2);
    s.pixels = [[1, 2], [3, 4]];
    resizeSprite(s, 4, 4, 0, 0);
    expect(s.pixels).toEqual([[1, 2], [3, 4]]);
  });
});
