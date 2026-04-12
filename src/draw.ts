import type { SpriteData, FillResult } from './types.js';
import { MAX_FILL_AREA } from './constants.js';

/** Set multiple pixels in a single deep-copy */
export function setPixels(
  sprite: SpriteData,
  coords: Array<{ x: number; y: number; color: number }>,
): SpriteData {
  if (coords.length === 0) return sprite;
  const pixels = sprite.pixels.map((row) => [...row]);
  for (const { x, y, color } of coords) {
    if (x >= 0 && x < sprite.width && y >= 0 && y < sprite.height) {
      pixels[y][x] = color;
    }
  }
  return { width: sprite.width, height: sprite.height, pixels };
}

/** Draw a line using Bresenham's algorithm */
export function drawLine(
  sprite: SpriteData,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
): SpriteData {
  const pixels = sprite.pixels.map((row) => [...row]);
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;

  while (true) {
    if (x >= 0 && x < sprite.width && y >= 0 && y < sprite.height) {
      pixels[y][x] = color;
    }
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return { width: sprite.width, height: sprite.height, pixels };
}

/** Draw a rectangle (outline or filled) */
export function drawRect(
  sprite: SpriteData,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  filled: boolean,
): SpriteData {
  const pixels = sprite.pixels.map((row) => [...row]);
  const x2 = x + w - 1;
  const y2 = y + h - 1;

  for (let py = y; py <= y2; py++) {
    for (let px = x; px <= x2; px++) {
      if (px < 0 || px >= sprite.width || py < 0 || py >= sprite.height) continue;
      const isEdge = px === x || px === x2 || py === y || py === y2;
      if (filled || isEdge) {
        pixels[py][px] = color;
      }
    }
  }

  return { width: sprite.width, height: sprite.height, pixels };
}

/** Flood fill using BFS with leak detection */
export function floodFill(
  sprite: SpriteData,
  startX: number,
  startY: number,
  fillColor: number,
): FillResult {
  const { width, height } = sprite;

  if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
    return { result: sprite, count: 0, leaked: false };
  }

  const targetColor = sprite.pixels[startY][startX];
  if (targetColor === fillColor) {
    return { result: sprite, count: 0, leaked: false };
  }

  const pixels = sprite.pixels.map((row) => [...row]);
  const visited = new Uint8Array(width * height);
  const queue: Array<[number, number]> = [[startX, startY]];
  visited[startY * width + startX] = 1;
  let count = 0;
  let leaked = false;
  let head = 0;

  while (head < queue.length) {
    if (count >= MAX_FILL_AREA) break;
    const [cx, cy] = queue[head++];

    if (pixels[cy][cx] !== targetColor) continue;
    pixels[cy][cx] = fillColor;
    count++;

    if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) {
      leaked = true;
    }

    const neighbors: Array<[number, number]> = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (!visited[ni]) {
        visited[ni] = 1;
        queue.push([nx, ny]);
      }
    }
  }

  return { result: { width, height, pixels }, count, leaked };
}

/** Options for copyRegion */
export interface CopyRegionOptions {
  sx?: number;
  sy?: number;
  w?: number;
  h?: number;
  dx: number;
  dy: number;
  /** If true, transparent source pixels overwrite the destination.
   *  If false (default), transparent source pixels are skipped. */
  includeTransparent?: boolean;
}

/**
 * Blit a rectangular region from src onto dst at (dx, dy).
 * Safe for self-copy (src === dst) with overlapping regions — the source
 * region is buffered before writing to the destination.
 * Out-of-bounds destination pixels are skipped silently.
 */
export function copyRegion(
  src: SpriteData,
  dst: SpriteData,
  opts: CopyRegionOptions,
): SpriteData {
  const sx = opts.sx ?? 0;
  const sy = opts.sy ?? 0;
  const w = opts.w ?? src.width - sx;
  const h = opts.h ?? src.height - sy;
  const { dx, dy, includeTransparent } = opts;

  // Buffer the source region first so self-copies with overlap work.
  const buffer: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    const ry = sy + y;
    for (let x = 0; x < w; x++) {
      const rx = sx + x;
      if (rx < 0 || rx >= src.width || ry < 0 || ry >= src.height) {
        row.push(-1);
      } else {
        row.push(src.pixels[ry][rx]);
      }
    }
    buffer.push(row);
  }

  const pixels = dst.pixels.map((row) => [...row]);
  for (let y = 0; y < h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const val = buffer[y][x];
      if (val < 0 && !includeTransparent) continue;
      pixels[ty][tx] = val;
    }
  }

  return { width: dst.width, height: dst.height, pixels };
}

/**
 * Shift all pixels by (dx, dy). If wrap is true, pixels that move off an edge
 * reappear on the opposite edge (torus). Otherwise vacated pixels are transparent.
 */
export function shiftSprite(
  sprite: SpriteData,
  dx: number,
  dy: number,
  wrap: boolean,
): SpriteData {
  const { width, height } = sprite;
  const pixels: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      let sx = x - dx;
      let sy = y - dy;
      if (wrap) {
        sx = ((sx % width) + width) % width;
        sy = ((sy % height) + height) % height;
        row.push(sprite.pixels[sy][sx]);
      } else {
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) {
          row.push(-1);
        } else {
          row.push(sprite.pixels[sy][sx]);
        }
      }
    }
    pixels.push(row);
  }
  return { width, height, pixels };
}

/**
 * Resize a sprite to new dimensions. The existing pixels are placed at
 * (offsetX, offsetY) in the new canvas. Pixels outside the new bounds are
 * dropped (crop); vacant pixels in the new canvas are transparent (pad).
 */
export function resizeSprite(
  sprite: SpriteData,
  newWidth: number,
  newHeight: number,
  offsetX: number,
  offsetY: number,
): SpriteData {
  const pixels: number[][] = [];
  for (let y = 0; y < newHeight; y++) {
    const row: number[] = [];
    const srcY = y - offsetY;
    for (let x = 0; x < newWidth; x++) {
      const srcX = x - offsetX;
      if (srcX < 0 || srcX >= sprite.width || srcY < 0 || srcY >= sprite.height) {
        row.push(-1);
      } else {
        row.push(sprite.pixels[srcY][srcX]);
      }
    }
    pixels.push(row);
  }
  return { width: newWidth, height: newHeight, pixels };
}

/** Mirror sprite horizontally (left half → right half) */
export function mirrorH(sprite: SpriteData, axisX?: number): SpriteData {
  const { width, height } = sprite;
  const pixels = sprite.pixels.map((row) => [...row]);
  const axis = axisX ?? Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < axis; x++) {
      const mirrorX = width - 1 - x;
      if (mirrorX >= 0 && mirrorX < width) {
        pixels[y][mirrorX] = pixels[y][x];
      }
    }
  }

  return { width, height, pixels };
}
