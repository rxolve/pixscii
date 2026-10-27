import { describe, it, expect, beforeAll } from 'vitest';
import { drawShapes, ditherThreshold, flattenCurve, resolveColorRef } from './shapes.js';
import { createEmpty } from './sprite.js';
import { drawLine } from './draw.js';
import { loadPalettes, getPalette } from './palette.js';
import { SCENE } from './slots.js';

beforeAll(async () => {
  await loadPalettes();
});

const count = (pixels: number[][], c: number) => pixels.flat().filter((p) => p === c).length;

describe('colors', () => {
  it('take indices, hex chars and slot names', () => {
    const scene = getPalette('scene-dusk');
    expect(resolveColorRef(3)).toBe(3);
    expect(resolveColorRef('A')).toBe(10);
    expect(resolveColorRef('.')).toBe(-1);
    expect(resolveColorRef('ground', scene)).toBe(SCENE.ground);
    expect(() => resolveColorRef('ground')).toThrow(/palette is needed/);
  });
});

describe('fills', () => {
  it('rect covers exactly its pixels', () => {
    const s = drawShapes(createEmpty(8, 8), [{ type: 'rect', x: 1, y: 2, w: 3, h: 4, fill: 5 }]);
    expect(count(s.pixels, 5)).toBe(12);
    expect(s.pixels[2][1]).toBe(5);
    expect(s.pixels[5][3]).toBe(5);
    expect(s.pixels[6][3]).toBe(-1);
  });

  it('circle is symmetric', () => {
    const s = drawShapes(createEmpty(16, 16), [{ type: 'circle', cx: 8, cy: 8, r: 5, fill: 1 }]);
    for (const row of s.pixels) expect(row).toEqual([...row].reverse());
    expect(s.pixels.map((r) => r.join())).toEqual([...s.pixels].reverse().map((r) => r.join()));
  });

  it('polygon fills a triangle by pixel centers', () => {
    const s = drawShapes(createEmpty(8, 8), [{ type: 'polygon', points: [[0, 0], [8, 0], [0, 8]], fill: 2 }]);
    // Centers strictly inside x + y < 8; the diagonal x + y = 7 sits on the edge and stays out
    expect(s.pixels[0][6]).toBe(2);
    expect(s.pixels[0][7]).toBe(-1);
    expect(s.pixels[6][0]).toBe(2);
    expect(count(s.pixels, 2)).toBe(28);
  });

  it('dither mixes two colors by amount', () => {
    const s = drawShapes(createEmpty(8, 8), [{ type: 'rect', x: 0, y: 0, w: 8, h: 8, fill: { dither: [1, 2], amount: 0.25 } }]);
    expect(count(s.pixels, 2)).toBe(16);
    expect(count(s.pixels, 1)).toBe(48);
  });

  it('gradient runs from the first stop to the last', () => {
    const s = drawShapes(createEmpty(4, 16), [{ type: 'rect', x: 0, y: 0, w: 4, h: 16, fill: { gradient: [1, 2, 3] } }]);
    // Dithered: the ends lean to their stop, the middle holds the middle stop
    expect(count([s.pixels[0]], 1)).toBeGreaterThanOrEqual(3);
    expect(s.pixels[0]).not.toContain(3);
    expect(count([s.pixels[15]], 3)).toBeGreaterThanOrEqual(3);
    expect(s.pixels[15]).not.toContain(1);
    expect(s.pixels[8]).toContain(2);
    const up = drawShapes(createEmpty(4, 16), [{ type: 'rect', x: 0, y: 0, w: 4, h: 16, fill: { gradient: [1, 3], direction: 'up' } }]);
    expect(count([up.pixels[0]], 3)).toBeGreaterThanOrEqual(3);
  });

  it('resolves slot names against the palette', () => {
    const s = drawShapes(createEmpty(4, 4), [{ type: 'rect', x: 0, y: 0, w: 4, h: 4, fill: 'water' }], getPalette('scene-sea'));
    expect(count(s.pixels, SCENE.water)).toBe(16);
  });
});

describe('strokes and lines', () => {
  it('stroke rings the inside edge', () => {
    const s = drawShapes(createEmpty(6, 6), [{ type: 'rect', x: 0, y: 0, w: 6, h: 6, fill: 1, stroke: { color: 0 } }]);
    expect(count(s.pixels, 0)).toBe(20);
    expect(count(s.pixels, 1)).toBe(16);
  });

  it('a width-1 line matches Bresenham', () => {
    const shapes = drawShapes(createEmpty(10, 10), [{ type: 'line', points: [[1, 1], [8, 5]], color: 4 }]);
    expect(shapes.pixels).toEqual(drawLine(createEmpty(10, 10), 1, 1, 8, 5, 4).pixels);
  });

  it('thick lines and curves reach their ends', () => {
    const s = drawShapes(createEmpty(20, 20), [
      { type: 'line', points: [[2, 10], [17, 10]], color: 1, width: 3 },
      { type: 'curve', points: [[2, 2], [10, 18], [18, 2]], color: 2 },
    ]);
    expect(s.pixels[9][2]).toBe(1);
    expect(s.pixels[11][16]).toBe(1);
    expect(s.pixels[2][2]).toBe(2);
    expect(s.pixels[2][18]).toBe(2);
    expect(flattenCurve([[0, 0], [5, 10], [10, 0]]).at(-1)).toEqual([10, 0]);
  });

  it('clips at the canvas edge', () => {
    const s = drawShapes(createEmpty(4, 4), [{ type: 'circle', cx: 0, cy: 0, r: 10, fill: 1 }]);
    expect(count(s.pixels, 1)).toBe(16);
  });
});

describe('dither threshold', () => {
  it('covers every level once per tile', () => {
    const levels = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) levels.add(ditherThreshold(x, y, 'bayer4'));
    expect(levels.size).toBe(16);
  });
});
