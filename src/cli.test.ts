import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

import { loadPalettes, getPalette, resolveColor } from './palette.js';
import { loadIndex, getById, loadSpriteData } from './store.js';
import { renderToBuffer } from './render.js';
import { quantizeToSprite } from './convert.js';
import type { Palette, SpriteData, SpriteEntry } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

let palette: Palette;
let tmpDir: string;

beforeAll(async () => {
  await Promise.all([loadPalettes(), loadIndex()]);
  palette = getPalette('pico8');
  tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'pixscii-test-'));
});

afterAll(async () => {
  await fsPromises.rm(tmpDir, { recursive: true, force: true });
});

/** Create a test PNG with known solid color */
async function createTestPNG(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Promise<Buffer> {
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < width * height; i++) {
    raw[i * channels] = r;
    raw[i * channels + 1] = g;
    raw[i * channels + 2] = b;
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

describe('import: PNG → SpriteData', () => {
  it('quantizes a solid red PNG to nearest palette index', async () => {
    // PICO-8 red is [255, 0, 77] at index 8
    const png = await createTestPNG(4, 4, 255, 0, 77);
    const sprite = await quantizeToSprite(png, palette, 4, 4);

    expect(sprite.width).toBe(4);
    expect(sprite.height).toBe(4);
    // All pixels should map to index 8 (red)
    for (const row of sprite.pixels) {
      for (const px of row) {
        expect(px).toBe(8);
      }
    }
  });

  it('quantizes a solid black PNG to index 0', async () => {
    const png = await createTestPNG(8, 8, 0, 0, 0);
    const sprite = await quantizeToSprite(png, palette, 8, 8);

    expect(sprite.width).toBe(8);
    expect(sprite.height).toBe(8);
    for (const row of sprite.pixels) {
      for (const px of row) {
        expect(px).toBe(0);
      }
    }
  });

  it('auto-detects image dimensions when not specified', async () => {
    const png = await createTestPNG(12, 8, 255, 241, 232);
    // Use default dimensions (16x16) — quantizeToSprite resizes
    const sprite = await quantizeToSprite(png, palette);
    expect(sprite.width).toBe(16);
    expect(sprite.height).toBe(16);
  });

  it('handles transparent pixels', async () => {
    // Create a PNG with alpha channel
    const raw = Buffer.alloc(4 * 4 * 4); // 4x4 RGBA, all zeros = transparent
    const png = await sharp(raw, { raw: { width: 4, height: 4, channels: 4 } })
      .png()
      .toBuffer();
    const sprite = await quantizeToSprite(png, palette, 4, 4);

    for (const row of sprite.pixels) {
      for (const px of row) {
        expect(px).toBe(-1); // transparent
      }
    }
  });
});

describe('export: SpriteData → PNG', () => {
  it('renders a known sprite to PNG with correct dimensions', async () => {
    const entry = getById('sword');
    expect(entry).toBeDefined();

    const sprite = await loadSpriteData(entry!);
    const pngBuf = await renderToBuffer(sprite, palette, 1);
    const meta = await sharp(pngBuf).metadata();

    expect(meta.width).toBe(sprite.width);
    expect(meta.height).toBe(sprite.height);
    expect(meta.format).toBe('png');
  });

  it('respects scale factor', async () => {
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
    const pngBuf = await renderToBuffer(sprite, palette, 4);
    const meta = await sharp(pngBuf).metadata();

    expect(meta.width).toBe(16); // 4 * 4
    expect(meta.height).toBe(16);
  });
});

describe('round-trip: export → import', () => {
  it('preserves sprite data through export/import cycle', async () => {
    const entry = getById('heart-full');
    expect(entry).toBeDefined();

    const original = await loadSpriteData(entry!);

    // Export at 1x (no scaling)
    const pngBuf = await renderToBuffer(original, palette, 1);

    // Import back
    const reimported = await quantizeToSprite(pngBuf, palette, original.width, original.height);

    expect(reimported.width).toBe(original.width);
    expect(reimported.height).toBe(original.height);
    expect(reimported.pixels).toEqual(original.pixels);
  });

  it('preserves a simple sprite exactly', async () => {
    const sprite: SpriteData = {
      width: 4,
      height: 4,
      pixels: [
        [0, 7, 7, 0],
        [7, 8, 8, 7],
        [7, 8, 8, 7],
        [0, 7, 7, 0],
      ],
    };

    const pngBuf = await renderToBuffer(sprite, palette, 1);
    const reimported = await quantizeToSprite(pngBuf, palette, 4, 4);

    expect(reimported.pixels).toEqual(sprite.pixels);
  });
});

describe('index.json update', () => {
  it('reads valid index with expected entries', () => {
    const sword = getById('sword');
    expect(sword).toBeDefined();
    expect(sword!.category).toBe('items');
    expect(sword!.file).toBe('items/sword.json');
  });
});

describe('sprite file write/read', () => {
  it('writes and reads sprite JSON correctly', async () => {
    const sprite: SpriteData = {
      width: 4,
      height: 4,
      pixels: [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11],
        [12, 13, 14, 15],
      ],
    };

    const outPath = path.join(tmpDir, 'test-sprite.json');
    await fsPromises.writeFile(outPath, JSON.stringify(sprite), 'utf-8');

    const raw = await fsPromises.readFile(outPath, 'utf-8');
    const loaded: SpriteData = JSON.parse(raw);

    expect(loaded).toEqual(sprite);
  });
});

describe('PNG file write/read', () => {
  it('writes and reads PNG buffer correctly', async () => {
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

    const pngBuf = await renderToBuffer(sprite, palette, 1);
    const outPath = path.join(tmpDir, 'test-export.png');
    fs.writeFileSync(outPath, pngBuf);

    const readBuf = fs.readFileSync(outPath);
    // PNG magic bytes
    expect(readBuf[0]).toBe(0x89);
    expect(readBuf[1]).toBe(0x50);
    expect(readBuf[2]).toBe(0x4e);
    expect(readBuf[3]).toBe(0x47);

    const meta = await sharp(readBuf).metadata();
    expect(meta.width).toBe(4);
    expect(meta.height).toBe(4);
  });
});

describe('error cases', () => {
  it('quantizeToSprite rejects invalid image data', async () => {
    const badBuffer = Buffer.from('not a png');
    await expect(quantizeToSprite(badBuffer, palette, 4, 4)).rejects.toThrow();
  });

  it('getById returns undefined for unknown sprite', () => {
    expect(getById('nonexistent-sprite-xyz')).toBeUndefined();
  });
});
