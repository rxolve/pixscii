import type { SpriteData, Canvas } from './types.js';
import { MAX_CANVAS_COUNT, CANVAS_ID_PREFIX, INSPECT_FULL_THRESHOLD } from './constants.js';

// --- Canvas store ---

const canvasStore = new Map<string, Canvas>();
let _counter = 0;

export function generateCanvasId(): string {
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  const seq = (++_counter).toString().padStart(3, '0');
  return `${CANVAS_ID_PREFIX}-${rand}-${seq}`;
}

export function storeCanvas(canvas: Canvas): string {
  if (canvasStore.size >= MAX_CANVAS_COUNT) {
    const oldest = canvasStore.keys().next().value!;
    canvasStore.delete(oldest);
  }
  const id = generateCanvasId();
  canvasStore.set(id, canvas);
  return id;
}

export function getCanvas(id: string): Canvas | undefined {
  return canvasStore.get(id);
}

export function requireCanvas(id: string): Canvas {
  const c = canvasStore.get(id);
  if (!c) throw new Error(`Canvas "${id}" not found`);
  return c;
}

export function updateCanvas(id: string, newData: SpriteData): void {
  const c = requireCanvas(id);
  canvasStore.set(id, { ...c, prev: c.data, data: newData });
}

export function setCanvasDirectly(id: string, canvas: Canvas): void {
  canvasStore.set(id, canvas);
}

export function deleteCanvas(id: string): boolean {
  return canvasStore.delete(id);
}

export function listCanvases(): string[] {
  return [...canvasStore.keys()];
}

/** Reset store — for testing only */
export function _resetStore(): void {
  canvasStore.clear();
  _counter = 0;
}

// --- Hex color protocol ---

const HEX_CHARS = '0123456789ABCDEF';

export function parseColor(c: string): number {
  if (c === '.') return -1;
  const idx = HEX_CHARS.indexOf(c.toUpperCase());
  if (idx === -1) throw new Error(`Invalid color "${c}". Use 0-F or "." for transparent.`);
  return idx;
}

export function formatColor(index: number): string {
  if (index < 0) return '.';
  if (index > 15) throw new Error(`Color index ${index} out of range (0-15)`);
  return HEX_CHARS[index];
}

// --- Hex pixel encoding/decoding ---

/** Encode number[][] → string[] (for JSON storage) */
export function encodePixels(pixels: number[][]): string[] {
  return pixels.map((row) => row.map(formatColor).join(''));
}

/** Decode string[] → number[][] (from JSON storage). Also accepts number[][] passthrough. */
export function decodePixels(pixels: string[] | number[][]): number[][] {
  if (pixels.length === 0) return [];
  if (typeof pixels[0] === 'string') {
    return (pixels as string[]).map((row) => [...row].map(parseColor));
  }
  return pixels as number[][];
}

// --- Inspect formatting ---

export interface InspectOptions {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

function countNonTransparent(data: SpriteData): number {
  let n = 0;
  for (const row of data.pixels) {
    for (const px of row) {
      if (px >= 0) n++;
    }
  }
  return n;
}

function colorStats(data: SpriteData): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of data.pixels) {
    for (const px of row) {
      if (px >= 0) {
        counts.set(px, (counts.get(px) ?? 0) + 1);
      }
    }
  }
  return counts;
}

function hexDigit(n: number): string {
  return n.toString(16).toUpperCase();
}

function formatHeader(id: string, canvas: Canvas): string {
  const { data, width, height, palette } = canvas;
  const total = width * height;
  const filled = countNonTransparent(data);
  const stats = colorStats(data);

  const lines: string[] = [];
  lines.push(`id: ${id}`);
  lines.push(`size: ${width}x${height} | palette: ${palette} | non-transparent: ${filled}/${total}`);

  if (stats.size > 0) {
    const parts = [...stats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, cnt]) => `${formatColor(idx)}=${cnt}`);
    lines.push(`colors: ${parts.join(' ')}`);
  }

  return lines.join('\n');
}

function formatGrid(data: SpriteData, startX: number, startY: number, w: number, h: number): string {
  const lines: string[] = [];

  // Column header
  const colHeader = '     ' + Array.from({ length: w }, (_, i) => hexDigit((startX + i) % 16)).join('');
  lines.push(colHeader);

  // Rows
  for (let y = 0; y < h; y++) {
    const ry = startY + y;
    const rowLabel = hexDigit(ry % 16).padStart(2, ' ');
    let rowChars = '';
    for (let x = 0; x < w; x++) {
      const rx = startX + x;
      const px = data.pixels[ry]?.[rx] ?? -1;
      rowChars += formatColor(px);
    }
    lines.push(`${rowLabel}: ${rowChars}`);
  }

  return lines.join('\n');
}

export function inspectCanvas(
  id: string,
  canvas: Canvas,
  opts?: InspectOptions,
): string {
  const { data, width, height } = canvas;
  const header = formatHeader(id, canvas);

  // Small canvas: full grid always
  if (width <= INSPECT_FULL_THRESHOLD && height <= INSPECT_FULL_THRESHOLD) {
    return header + '\n\n' + formatGrid(data, 0, 0, width, height);
  }

  // Large canvas with region specified
  if (opts?.x !== undefined && opts?.y !== undefined) {
    const rx = opts.x;
    const ry = opts.y;
    const rw = Math.min(opts.w ?? INSPECT_FULL_THRESHOLD, width - rx);
    const rh = Math.min(opts.h ?? INSPECT_FULL_THRESHOLD, height - ry);
    return header + `\nregion: (${rx},${ry}) ${rw}x${rh}` + '\n\n' + formatGrid(data, rx, ry, rw, rh);
  }

  // Large canvas without region: header + instructions
  return header + `\n\nCanvas is ${width}x${height}. Use inspect with x, y, w, h to view a region (max ${INSPECT_FULL_THRESHOLD}x${INSPECT_FULL_THRESHOLD}).`;
}
