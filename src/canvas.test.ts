import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateCanvasId,
  storeCanvas,
  getCanvas,
  requireCanvas,
  deleteCanvas,
  updateCanvas,
  parseColor,
  formatColor,
  inspectCanvas,
  listCanvasesWithMeta,
  cloneCanvas,
  diffCanvases,
  _resetStore,
} from './canvas.js';
import type { Canvas, SpriteData } from './types.js';
import { CANVAS_ID_PREFIX, MAX_CANVAS_COUNT } from './constants.js';

function makeCanvas(w = 4, h = 4, fill = -1): Canvas {
  const pixels = Array.from({ length: h }, () => new Array(w).fill(fill));
  return {
    data: { width: w, height: h, pixels },
    width: w,
    height: h,
    palette: 'pico8',
    prev: null,
  };
}

beforeEach(() => {
  _resetStore();
});

describe('generateCanvasId', () => {
  it('starts with prefix', () => {
    const id = generateCanvasId();
    expect(id.startsWith(CANVAS_ID_PREFIX + '-')).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCanvasId()));
    expect(ids.size).toBe(50);
  });
});

describe('storeCanvas / getCanvas / deleteCanvas', () => {
  it('stores and retrieves a canvas', () => {
    const c = makeCanvas();
    const id = storeCanvas(c);
    expect(getCanvas(id)).toBe(c);
  });

  it('returns undefined for unknown ID', () => {
    expect(getCanvas('nope')).toBeUndefined();
  });

  it('deletes a canvas', () => {
    const id = storeCanvas(makeCanvas());
    expect(deleteCanvas(id)).toBe(true);
    expect(getCanvas(id)).toBeUndefined();
  });
});

describe('requireCanvas', () => {
  it('throws for unknown ID', () => {
    expect(() => requireCanvas('bad-id')).toThrow('Canvas "bad-id" not found');
  });

  it('returns canvas for valid ID', () => {
    const c = makeCanvas();
    const id = storeCanvas(c);
    expect(requireCanvas(id)).toBe(c);
  });
});

describe('updateCanvas', () => {
  it('sets prev to old data and data to new', () => {
    const c = makeCanvas(2, 2, 0);
    const id = storeCanvas(c);
    const newData: SpriteData = { width: 2, height: 2, pixels: [[1, 1], [1, 1]] };
    updateCanvas(id, newData);

    const updated = requireCanvas(id);
    expect(updated.data).toBe(newData);
    expect(updated.prev).toBe(c.data);
  });

  it('prev is always one step behind after multiple updates', () => {
    const c = makeCanvas(2, 2, 0);
    const id = storeCanvas(c);
    const d1: SpriteData = { width: 2, height: 2, pixels: [[1, 1], [1, 1]] };
    const d2: SpriteData = { width: 2, height: 2, pixels: [[2, 2], [2, 2]] };

    updateCanvas(id, d1);
    updateCanvas(id, d2);

    const final = requireCanvas(id);
    expect(final.data).toBe(d2);
    expect(final.prev).toBe(d1); // prev is d1, not original
  });
});

describe('MAX_CANVAS_COUNT eviction', () => {
  it('evicts oldest when limit reached', () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_CANVAS_COUNT; i++) {
      ids.push(storeCanvas(makeCanvas()));
    }
    // All should exist
    expect(getCanvas(ids[0])).toBeDefined();

    // Add one more — oldest should be evicted
    storeCanvas(makeCanvas());
    expect(getCanvas(ids[0])).toBeUndefined();
    expect(getCanvas(ids[1])).toBeDefined();
  });
});

describe('parseColor / formatColor', () => {
  it('"." roundtrips to -1', () => {
    expect(parseColor('.')).toBe(-1);
    expect(formatColor(-1)).toBe('.');
  });

  it('"0"-"F" roundtrip', () => {
    for (let i = 0; i <= 15; i++) {
      const c = i.toString(16).toUpperCase();
      expect(parseColor(c)).toBe(i);
      expect(formatColor(i)).toBe(c);
    }
  });

  it('lowercase works', () => {
    expect(parseColor('a')).toBe(10);
    expect(parseColor('f')).toBe(15);
  });

  it('throws on invalid char', () => {
    expect(() => parseColor('G')).toThrow('Invalid color');
    expect(() => parseColor('#')).toThrow('Invalid color');
  });

  it('formatColor throws on out of range', () => {
    expect(() => formatColor(16)).toThrow('out of range');
  });
});

describe('inspectCanvas', () => {
  it('produces full grid for small canvas', () => {
    const c = makeCanvas(4, 4);
    c.data.pixels[0][0] = 8;
    c.data.pixels[1][2] = 1;
    const id = storeCanvas(c);
    const text = inspectCanvas(id, c);

    expect(text).toContain('id: ' + id);
    expect(text).toContain('size: 4x4');
    expect(text).toContain('palette: pico8');
    expect(text).toContain('8...');  // first row: 8 followed by dots
    expect(text).toContain('..1.'); // second row
  });

  it('shows region instructions for large canvas', () => {
    const c = makeCanvas(64, 64);
    const id = storeCanvas(c);
    const text = inspectCanvas(id, c);
    expect(text).toContain('Use inspect with x, y, w, h');
  });

  it('shows region when coords provided for large canvas', () => {
    const c = makeCanvas(64, 64);
    c.data.pixels[2][3] = 5;
    const id = storeCanvas(c);
    const text = inspectCanvas(id, c, { x: 0, y: 0, w: 8, h: 8 });
    expect(text).toContain('region:');
    expect(text).toContain('...5'); // row 2 has a 5 at col 3
  });
});

describe('listCanvasesWithMeta', () => {
  it('returns empty array when no canvases', () => {
    expect(listCanvasesWithMeta()).toEqual([]);
  });

  it('reports dimensions, palette, pixel count, and undo state', () => {
    const c = makeCanvas(4, 4);
    c.data.pixels[0][0] = 1;
    c.data.pixels[1][1] = 2;
    const id = storeCanvas(c);

    const metas = listCanvasesWithMeta();
    expect(metas).toHaveLength(1);
    expect(metas[0]).toMatchObject({
      id,
      width: 4,
      height: 4,
      palette: 'pico8',
      nonTransparent: 2,
      hasUndo: false,
    });
  });

  it('marks hasUndo true after an update', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    updateCanvas(id, { width: 2, height: 2, pixels: [[1, 1], [1, 1]] });
    expect(listCanvasesWithMeta()[0].hasUndo).toBe(true);
  });
});

describe('cloneCanvas', () => {
  it('creates a fresh canvas with independent pixel data', () => {
    const c = makeCanvas(3, 3);
    c.data.pixels[0][0] = 5;
    const srcId = storeCanvas(c);
    const cloneId = cloneCanvas(srcId);

    expect(cloneId).not.toBe(srcId);
    const clone = requireCanvas(cloneId);
    expect(clone.data.pixels[0][0]).toBe(5);

    // Mutating the clone must not affect the source.
    clone.data.pixels[0][0] = 8;
    expect(requireCanvas(srcId).data.pixels[0][0]).toBe(5);
  });

  it('clone starts with no undo history', () => {
    const c = makeCanvas(2, 2);
    const srcId = storeCanvas(c);
    updateCanvas(srcId, { width: 2, height: 2, pixels: [[1, 1], [1, 1]] });
    expect(requireCanvas(srcId).prev).not.toBeNull();

    const cloneId = cloneCanvas(srcId);
    expect(requireCanvas(cloneId).prev).toBeNull();
  });

  it('throws for unknown source ID', () => {
    expect(() => cloneCanvas('bad-id')).toThrow('not found');
  });
});

describe('diffCanvases', () => {
  it('reports zero changes for identical canvases', () => {
    const a = makeCanvas(3, 3);
    const b = makeCanvas(3, 3);
    const aId = storeCanvas(a);
    const bId = storeCanvas(b);

    const summary = diffCanvases(aId, bId);
    expect(summary.changed).toBe(0);
    expect(summary.grid).toContain('===');
  });

  it('marks differences with the new color character', () => {
    const a = makeCanvas(2, 2);
    const b = makeCanvas(2, 2);
    b.data.pixels[0][0] = 8;
    b.data.pixels[1][1] = 10;
    const aId = storeCanvas(a);
    const bId = storeCanvas(b);

    const summary = diffCanvases(aId, bId);
    expect(summary.changed).toBe(2);
    // Row 0 starts with '8' (new color at 0,0), '=' at 0,1
    expect(summary.grid).toContain('8=');
    // Row 1 has '=' then 'A' (10 hex)
    expect(summary.grid).toContain('=A');
  });

  it('throws on dimension mismatch', () => {
    const aId = storeCanvas(makeCanvas(4, 4));
    const bId = storeCanvas(makeCanvas(8, 8));
    expect(() => diffCanvases(aId, bId)).toThrow('size mismatch');
  });
});
