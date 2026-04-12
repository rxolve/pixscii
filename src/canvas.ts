import type { SpriteData, Canvas } from './types.js';
import { MAX_CANVAS_COUNT, CANVAS_ID_PREFIX, INSPECT_FULL_THRESHOLD, MAX_SNAPSHOTS_PER_CANVAS, MAX_SNAPSHOT_NAME_LENGTH, MAX_ALIAS_LENGTH, ALIAS_PATTERN } from './constants.js';

// --- Canvas store ---

const canvasStore = new Map<string, Canvas>();
/** alias name -> canonical canvas id */
const aliasStore = new Map<string, string>();
let _counter = 0;

export function generateCanvasId(): string {
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, '0');
  const seq = (++_counter).toString().padStart(3, '0');
  return `${CANVAS_ID_PREFIX}-${rand}-${seq}`;
}

/** Resolve an alias or raw canvas id to the canonical id. Returns the input
 *  unchanged if it's already a canvas id or if the alias is unknown — the
 *  caller surfaces a "not found" error at lookup time. */
export function resolveCanvasId(idOrAlias: string): string {
  if (canvasStore.has(idOrAlias)) return idOrAlias;
  const aliased = aliasStore.get(idOrAlias);
  if (aliased && canvasStore.has(aliased)) return aliased;
  return idOrAlias;
}

export function storeCanvas(canvas: Canvas): string {
  if (canvasStore.size >= MAX_CANVAS_COUNT) {
    const oldest = canvasStore.keys().next().value!;
    // Also drop any aliases that pointed at the evicted canvas.
    for (const [alias, target] of aliasStore) {
      if (target === oldest) aliasStore.delete(alias);
    }
    canvasStore.delete(oldest);
  }
  const id = generateCanvasId();
  canvasStore.set(id, canvas);
  return id;
}

export function getCanvas(idOrAlias: string): Canvas | undefined {
  return canvasStore.get(resolveCanvasId(idOrAlias));
}

export function requireCanvas(idOrAlias: string): Canvas {
  const id = resolveCanvasId(idOrAlias);
  const c = canvasStore.get(id);
  if (!c) throw new Error(`Canvas "${idOrAlias}" not found`);
  return c;
}

export function updateCanvas(idOrAlias: string, newData: SpriteData): void {
  const id = resolveCanvasId(idOrAlias);
  const c = requireCanvas(id);
  canvasStore.set(id, { ...c, prev: c.data, data: newData });
}

export function setCanvasDirectly(idOrAlias: string, canvas: Canvas): void {
  canvasStore.set(resolveCanvasId(idOrAlias), canvas);
}

/** Delete a canvas and any aliases that pointed at it. */
export function deleteCanvas(idOrAlias: string): boolean {
  const id = resolveCanvasId(idOrAlias);
  if (!canvasStore.has(id)) return false;
  for (const [alias, target] of aliasStore) {
    if (target === id) aliasStore.delete(alias);
  }
  return canvasStore.delete(id);
}

export function listCanvases(): string[] {
  return [...canvasStore.keys()];
}

// --- Alias management ---

/** Validate and register an alias -> canvas-id mapping. Throws on conflicts. */
export function setAlias(name: string, idOrAlias: string): string {
  if (name.length === 0) throw new Error('Alias name cannot be empty');
  if (name.length > MAX_ALIAS_LENGTH) {
    throw new Error(`Alias exceeds ${MAX_ALIAS_LENGTH} chars`);
  }
  if (!ALIAS_PATTERN.test(name)) {
    throw new Error(`Alias "${name}" must match ${ALIAS_PATTERN} (lowercase letters, digits, "_", "-"; not starting with "${CANVAS_ID_PREFIX}-")`);
  }
  if (name.startsWith(`${CANVAS_ID_PREFIX}-`)) {
    throw new Error(`Alias cannot start with "${CANVAS_ID_PREFIX}-" (reserved for canvas IDs)`);
  }
  if (canvasStore.has(name)) {
    throw new Error(`Alias "${name}" collides with a canvas id`);
  }
  const id = resolveCanvasId(idOrAlias);
  if (!canvasStore.has(id)) {
    throw new Error(`Canvas "${idOrAlias}" not found`);
  }
  aliasStore.set(name, id);
  return id;
}

/** Return aliases pointing at a given canvas id. */
export function aliasesFor(id: string): string[] {
  const out: string[] = [];
  for (const [alias, target] of aliasStore) {
    if (target === id) out.push(alias);
  }
  return out;
}

/** Reset store — for testing only */
export function _resetStore(): void {
  canvasStore.clear();
  aliasStore.clear();
  _counter = 0;
}

/** Metadata for a canvas in the store */
export interface CanvasMeta {
  id: string;
  aliases: string[];
  width: number;
  height: number;
  palette: string;
  nonTransparent: number;
  hasUndo: boolean;
  snapshotCount: number;
}

export function listCanvasesWithMeta(): CanvasMeta[] {
  const out: CanvasMeta[] = [];
  for (const [id, c] of canvasStore) {
    out.push({
      id,
      aliases: aliasesFor(id),
      width: c.width,
      height: c.height,
      palette: c.palette,
      nonTransparent: countNonTransparent(c.data),
      hasUndo: c.prev !== null,
      snapshotCount: c.snapshots?.size ?? 0,
    });
  }
  return out;
}

/** Clone a canvas into a fresh entry. The new canvas has no undo history. */
export function cloneCanvas(sourceId: string): string {
  const src = requireCanvas(sourceId);
  const copiedPixels = src.data.pixels.map((row) => [...row]);
  return storeCanvas({
    data: { width: src.data.width, height: src.data.height, pixels: copiedPixels },
    width: src.width,
    height: src.height,
    palette: src.palette,
    prev: null,
  });
}

/** Validate a snapshot name. */
function validateSnapshotName(name: string): void {
  if (name.length === 0) throw new Error('Snapshot name cannot be empty');
  if (name.length > MAX_SNAPSHOT_NAME_LENGTH) {
    throw new Error(`Snapshot name exceeds ${MAX_SNAPSHOT_NAME_LENGTH} chars`);
  }
}

/** Save the current canvas state under a name. Returns the new snapshot count. */
export function snapshotCanvas(idOrAlias: string, name: string): number {
  validateSnapshotName(name);
  const id = resolveCanvasId(idOrAlias);
  const c = requireCanvas(id);
  const snapshots = c.snapshots ?? new Map<string, SpriteData>();
  // Adding a new name (not overwriting) — enforce the limit.
  if (!snapshots.has(name) && snapshots.size >= MAX_SNAPSHOTS_PER_CANVAS) {
    throw new Error(
      `Canvas "${idOrAlias}" already holds ${MAX_SNAPSHOTS_PER_CANVAS} snapshots (max). Overwrite an existing name instead.`,
    );
  }
  // Deep-copy the current pixels so later edits can't mutate the snapshot.
  const copy: SpriteData = {
    width: c.data.width,
    height: c.data.height,
    pixels: c.data.pixels.map((row) => [...row]),
  };
  snapshots.set(name, copy);
  canvasStore.set(id, { ...c, snapshots });
  return snapshots.size;
}

/** Restore a named snapshot onto a canvas. The current state becomes prev. */
export function restoreSnapshot(idOrAlias: string, name: string): void {
  const id = resolveCanvasId(idOrAlias);
  const c = requireCanvas(id);
  const snap = c.snapshots?.get(name);
  if (!snap) {
    const available = c.snapshots ? [...c.snapshots.keys()] : [];
    const list = available.length > 0 ? available.join(', ') : '(none)';
    throw new Error(`Snapshot "${name}" not found on ${idOrAlias}. Available: ${list}`);
  }
  // Deep-copy on restore so future edits don't mutate the snapshot.
  const data: SpriteData = {
    width: snap.width,
    height: snap.height,
    pixels: snap.pixels.map((row) => [...row]),
  };
  canvasStore.set(id, {
    ...c,
    data,
    width: data.width,
    height: data.height,
    prev: c.data,
  });
}

/** List snapshot names on a canvas. */
export function listSnapshots(idOrAlias: string): string[] {
  const c = requireCanvas(idOrAlias);
  return c.snapshots ? [...c.snapshots.keys()] : [];
}

/**
 * Replace a canvas's data and sync width/height from the new pixel grid.
 * The old data becomes prev (so undo rolls back the resize).
 */
export function resizeCanvas(idOrAlias: string, newData: SpriteData): void {
  const id = resolveCanvasId(idOrAlias);
  const c = requireCanvas(id);
  canvasStore.set(id, {
    ...c,
    data: newData,
    width: newData.width,
    height: newData.height,
    prev: c.data,
  });
}

/**
 * Switch the palette mode of a canvas without touching pixel indices.
 * Colors 0-F mean different RGB values under different palettes.
 * Caller is responsible for validating paletteId against loaded palettes.
 */
export function setCanvasPalette(idOrAlias: string, paletteId: string): void {
  const id = resolveCanvasId(idOrAlias);
  const c = requireCanvas(id);
  canvasStore.set(id, { ...c, palette: paletteId });
}

/** Summary of a diff between two canvases */
export interface DiffSummary {
  width: number;
  height: number;
  changed: number;
  grid: string;
}

/**
 * Diff two canvases pixel-by-pixel. Dimensions must match.
 * Returns a hex grid where '=' marks unchanged pixels and the
 * new color hex char (or '.') marks pixels that differ in b.
 */
export function diffCanvases(aId: string, bId: string): DiffSummary {
  const a = requireCanvas(aId);
  const b = requireCanvas(bId);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Canvas size mismatch: ${aId} is ${a.width}x${a.height}, ${bId} is ${b.width}x${b.height}`,
    );
  }

  const lines: string[] = [];
  const colHeader = '     ' + Array.from({ length: a.width }, (_, i) => hexDigit(i % 16)).join('');
  lines.push(colHeader);

  let changed = 0;
  for (let y = 0; y < a.height; y++) {
    const rowLabel = hexDigit(y % 16).padStart(2, ' ');
    let rowChars = '';
    for (let x = 0; x < a.width; x++) {
      const pa = a.data.pixels[y]?.[x] ?? -1;
      const pb = b.data.pixels[y]?.[x] ?? -1;
      if (pa === pb) {
        rowChars += '=';
      } else {
        rowChars += formatColor(pb);
        changed++;
      }
    }
    lines.push(`${rowLabel}: ${rowChars}`);
  }

  return { width: a.width, height: a.height, changed, grid: lines.join('\n') };
}

// --- Bounding box and stat ---

/** Tight bounding box of non-transparent content, or null if fully transparent. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeBoundingBox(data: SpriteData): BoundingBox | null {
  let minX = data.width;
  let minY = data.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < data.height; y++) {
    const row = data.pixels[y];
    for (let x = 0; x < data.width; x++) {
      if (row[x] >= 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Detailed metadata for a single canvas. */
export interface CanvasStat {
  id: string;
  aliases: string[];
  width: number;
  height: number;
  palette: string;
  nonTransparent: number;
  total: number;
  bbox: BoundingBox | null;
  colors: Array<{ index: number; count: number }>;
  hasUndo: boolean;
  snapshotNames: string[];
}

export function statCanvas(idOrAlias: string): CanvasStat {
  const id = resolveCanvasId(idOrAlias);
  const c = requireCanvas(id);
  const stats = colorStats(c.data);
  const colors = [...stats.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, count]) => ({ index, count }));
  return {
    id,
    aliases: aliasesFor(id),
    width: c.width,
    height: c.height,
    palette: c.palette,
    nonTransparent: countNonTransparent(c.data),
    total: c.width * c.height,
    bbox: computeBoundingBox(c.data),
    colors,
    hasUndo: c.prev !== null,
    snapshotNames: c.snapshots ? [...c.snapshots.keys()] : [],
  };
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
