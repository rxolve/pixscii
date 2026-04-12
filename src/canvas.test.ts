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
  snapshotCanvas,
  restoreSnapshot,
  listSnapshots,
  setCanvasPalette,
  resizeCanvas,
  setAlias,
  aliasesFor,
  resolveCanvasId,
  statCanvas,
  computeBoundingBox,
  _resetStore,
} from './canvas.js';
import { MAX_SNAPSHOTS_PER_CANVAS } from './constants.js';
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

describe('snapshotCanvas / restoreSnapshot', () => {
  it('saves and restores a named snapshot', () => {
    const c = makeCanvas(2, 2);
    c.data.pixels[0][0] = 1;
    const id = storeCanvas(c);

    snapshotCanvas(id, 'start');
    // Mutate the canvas.
    updateCanvas(id, { width: 2, height: 2, pixels: [[9, 9], [9, 9]] });
    expect(requireCanvas(id).data.pixels[0][0]).toBe(9);

    restoreSnapshot(id, 'start');
    expect(requireCanvas(id).data.pixels[0][0]).toBe(1);
  });

  it('restore sets prev so undo can revert the restore', () => {
    const c = makeCanvas(2, 2);
    c.data.pixels[0][0] = 1;
    const id = storeCanvas(c);

    snapshotCanvas(id, 's');
    updateCanvas(id, { width: 2, height: 2, pixels: [[9, 9], [9, 9]] });
    const before = requireCanvas(id).data;

    restoreSnapshot(id, 's');
    expect(requireCanvas(id).prev).toBe(before);
  });

  it('snapshots are isolated from later edits', () => {
    const c = makeCanvas(2, 2);
    c.data.pixels[0][0] = 3;
    const id = storeCanvas(c);

    snapshotCanvas(id, 's');
    // Mutate the live canvas after snapshotting.
    const live = requireCanvas(id);
    live.data.pixels[0][0] = 7;

    restoreSnapshot(id, 's');
    expect(requireCanvas(id).data.pixels[0][0]).toBe(3);
  });

  it('overwriting a snapshot name keeps the count stable', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    expect(snapshotCanvas(id, 'a')).toBe(1);
    expect(snapshotCanvas(id, 'a')).toBe(1);
    expect(snapshotCanvas(id, 'b')).toBe(2);
  });

  it('listSnapshots reflects saved names', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    snapshotCanvas(id, 'x');
    snapshotCanvas(id, 'y');
    expect(listSnapshots(id).sort()).toEqual(['x', 'y']);
  });

  it('throws when restoring an unknown name, with available names in the message', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    snapshotCanvas(id, 'only');
    expect(() => restoreSnapshot(id, 'missing')).toThrow(/only/);
  });

  it('rejects empty names', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    expect(() => snapshotCanvas(id, '')).toThrow('cannot be empty');
  });

  it('enforces the per-canvas snapshot limit', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    for (let i = 0; i < MAX_SNAPSHOTS_PER_CANVAS; i++) {
      snapshotCanvas(id, `n${i}`);
    }
    expect(() => snapshotCanvas(id, 'overflow')).toThrow(/max/);
    // Overwriting an existing name is still allowed at the limit.
    expect(() => snapshotCanvas(id, 'n0')).not.toThrow();
  });

  it('snapshotCount surfaces through listCanvasesWithMeta', () => {
    const c = makeCanvas(2, 2);
    const id = storeCanvas(c);
    snapshotCanvas(id, 'a');
    snapshotCanvas(id, 'b');
    const meta = listCanvasesWithMeta().find((m) => m.id === id)!;
    expect(meta.snapshotCount).toBe(2);
  });
});

describe('resizeCanvas', () => {
  it('syncs width/height on the Canvas wrapper and records prev', () => {
    const c = makeCanvas(2, 2);
    c.data.pixels[0][0] = 1;
    const id = storeCanvas(c);

    const bigger: SpriteData = {
      width: 4,
      height: 4,
      pixels: Array.from({ length: 4 }, () => new Array(4).fill(-1)),
    };
    bigger.pixels[0][0] = 1;
    resizeCanvas(id, bigger);

    const after = requireCanvas(id);
    expect(after.width).toBe(4);
    expect(after.height).toBe(4);
    expect(after.data).toBe(bigger);
    expect(after.prev).toBe(c.data);
  });
});

describe('setCanvasPalette', () => {
  it('updates the palette id without touching pixel data', () => {
    const c = makeCanvas(2, 2);
    c.data.pixels[0][0] = 5;
    const id = storeCanvas(c);

    setCanvasPalette(id, 'grayscale');
    const updated = requireCanvas(id);
    expect(updated.palette).toBe('grayscale');
    expect(updated.data.pixels[0][0]).toBe(5);
  });
});

describe('aliases', () => {
  it('setAlias resolves an alias back to the canonical id', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    expect(resolveCanvasId('hero')).toBe(id);
    expect(requireCanvas('hero').width).toBe(2);
  });

  it('multiple aliases can point at the same canvas', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    setAlias('mainchar', id);
    expect(aliasesFor(id).sort()).toEqual(['hero', 'mainchar']);
  });

  it('killing a canvas releases its aliases', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    deleteCanvas(id);
    // Alias should no longer resolve.
    expect(() => requireCanvas('hero')).toThrow();
    expect(aliasesFor(id)).toEqual([]);
  });

  it('kill accepts an alias as the target', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    expect(deleteCanvas('hero')).toBe(true);
    expect(requireCanvas).toThrow; // typeof check; silence unused
    expect(() => requireCanvas(id)).toThrow();
  });

  it('rejects invalid alias characters', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    expect(() => setAlias('Has Space', id)).toThrow();
    expect(() => setAlias('UPPER', id)).toThrow();
    expect(() => setAlias('-startsWithDash', id)).toThrow();
  });

  it('rejects aliases starting with the canvas id prefix', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    expect(() => setAlias('cvs-fake', id)).toThrow(/cvs-/);
  });

  it('rejects empty and overlong aliases', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    expect(() => setAlias('', id)).toThrow('empty');
    expect(() => setAlias('a'.repeat(64), id)).toThrow('exceeds');
  });

  it('reassigning an alias points it at a new canvas', () => {
    const a = storeCanvas(makeCanvas(2, 2));
    const b = storeCanvas(makeCanvas(4, 4));
    setAlias('active', a);
    setAlias('active', b);
    expect(requireCanvas('active').width).toBe(4);
    expect(aliasesFor(a)).toEqual([]);
    expect(aliasesFor(b)).toEqual(['active']);
  });

  it('alias can be used anywhere canvas_id is accepted — updateCanvas', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    updateCanvas('hero', { width: 2, height: 2, pixels: [[1, 1], [1, 1]] });
    expect(requireCanvas(id).data.pixels[0][0]).toBe(1);
  });

  it('alias survives through snapshot + restore', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    snapshotCanvas('hero', 'v1');
    updateCanvas('hero', { width: 2, height: 2, pixels: [[9, 9], [9, 9]] });
    restoreSnapshot('hero', 'v1');
    expect(aliasesFor(id)).toEqual(['hero']);
  });

  it('unknown alias throws on requireCanvas', () => {
    expect(() => requireCanvas('ghost')).toThrow(/not found/);
  });

  it('aliases surface in listCanvasesWithMeta', () => {
    const id = storeCanvas(makeCanvas(2, 2));
    setAlias('hero', id);
    const meta = listCanvasesWithMeta().find((m) => m.id === id)!;
    expect(meta.aliases).toEqual(['hero']);
  });
});

describe('computeBoundingBox', () => {
  it('returns null for fully transparent sprites', () => {
    const c = makeCanvas(4, 4);
    expect(computeBoundingBox(c.data)).toBeNull();
  });

  it('returns a single pixel bbox', () => {
    const c = makeCanvas(4, 4);
    c.data.pixels[2][1] = 5;
    expect(computeBoundingBox(c.data)).toEqual({ x: 1, y: 2, w: 1, h: 1 });
  });

  it('spans from first to last non-transparent pixel', () => {
    const c = makeCanvas(8, 8);
    c.data.pixels[1][2] = 1;
    c.data.pixels[5][6] = 2;
    expect(computeBoundingBox(c.data)).toEqual({ x: 2, y: 1, w: 5, h: 5 });
  });
});

describe('statCanvas', () => {
  it('returns structured metadata with bbox and color histogram', () => {
    const c = makeCanvas(4, 4);
    c.data.pixels[1][1] = 8;
    c.data.pixels[1][2] = 8;
    c.data.pixels[2][1] = 1;
    const id = storeCanvas(c);
    setAlias('hero', id);

    const s = statCanvas('hero');
    expect(s.id).toBe(id);
    expect(s.aliases).toEqual(['hero']);
    expect(s.width).toBe(4);
    expect(s.height).toBe(4);
    expect(s.nonTransparent).toBe(3);
    expect(s.total).toBe(16);
    expect(s.bbox).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    // Color histogram sorted by index.
    expect(s.colors).toEqual([
      { index: 1, count: 1 },
      { index: 8, count: 2 },
    ]);
    expect(s.hasUndo).toBe(false);
  });

  it('reports null bbox for fully transparent canvas', () => {
    const id = storeCanvas(makeCanvas(4, 4));
    expect(statCanvas(id).bbox).toBeNull();
  });
});
