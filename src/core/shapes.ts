import type { Palette, SpriteData } from './types.js';
import { slotIndex } from './slots.js';

/**
 * Shapes: write geometry, get pixel art. Every shape is rasterized at pixel centers with no anti-aliasing,
 * so each pixel is exactly one palette index. Gradients and soft fills come from ordered dithering.
 */

/** A palette index, a hex char ("0"-"F", "." = transparent), or a slot name ("sky-top") resolved against the palette */
export type ColorRef = number | string;

export type DitherPattern = 'bayer2' | 'bayer4' | 'bayer8';

export type Fill =
  | ColorRef
  /** Two colors mixed by an ordered dither. `amount` is the share of the second color, 0-1 (default 0.5) */
  | { dither: [ColorRef, ColorRef]; amount?: number; pattern?: DitherPattern }
  /** Color stops spread across the shape, dithered between neighbors (default direction "down") */
  | { gradient: ColorRef[]; direction?: 'down' | 'up' | 'right' | 'left'; pattern?: DitherPattern };

/** Outline drawn inside the shape's edge */
export interface Stroke {
  color: ColorRef;
  width?: number;
}

export type Point = [number, number];

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; radius?: number; fill?: Fill; stroke?: Stroke }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: Fill; stroke?: Stroke }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill?: Fill; stroke?: Stroke }
  | { type: 'polygon'; points: Point[]; fill?: Fill; stroke?: Stroke }
  /** Polyline through the points */
  | { type: 'line'; points: Point[]; color: ColorRef; width?: number }
  /** Bezier: 3 points = quadratic, 4 = cubic */
  | { type: 'curve'; points: Point[]; color: ColorRef; width?: number };

export const MAX_SHAPES = 256;
const MAX_POINTS = 256;

// --- Colors and dithering ---

const HEX = '0123456789ABCDEF';

export function resolveColorRef(ref: ColorRef, palette?: Palette): number {
  if (typeof ref === 'number') {
    if (!Number.isInteger(ref) || ref < -1) throw new Error(`Invalid color index ${ref}`);
    return ref;
  }
  if (ref === '.') return -1;
  if (ref.length === 1 && HEX.includes(ref.toUpperCase())) return HEX.indexOf(ref.toUpperCase());
  if (!palette) throw new Error(`Color "${ref}" is a slot name, so a palette is needed to resolve it`);
  return slotIndex(palette, ref);
}

function bayer(n: number): number[][] {
  if (n === 1) return [[0]];
  const half = bayer(n / 2);
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let y = 0; y < n / 2; y++) {
    for (let x = 0; x < n / 2; x++) {
      const v = half[y][x] * 4;
      m[y][x] = v;
      m[y][x + n / 2] = v + 2;
      m[y + n / 2][x] = v + 3;
      m[y + n / 2][x + n / 2] = v + 1;
    }
  }
  return m;
}

const BAYER: Record<DitherPattern, number[][]> = { bayer2: bayer(2), bayer4: bayer(4), bayer8: bayer(8) };

/** Ordered-dither threshold at a pixel, in (0, 1) */
export function ditherThreshold(x: number, y: number, pattern: DitherPattern = 'bayer4'): number {
  const m = BAYER[pattern];
  const n = m.length;
  return (m[((y % n) + n) % n][((x % n) + n) % n] + 0.5) / (n * n);
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Turn a fill into a per-pixel color function over the shape's box */
function fillFn(fill: Fill, palette: Palette | undefined, box: Box): (x: number, y: number) => number {
  if (typeof fill === 'number' || typeof fill === 'string') {
    const c = resolveColorRef(fill, palette);
    return () => c;
  }
  if ('dither' in fill) {
    const [a, b] = fill.dither.map((r) => resolveColorRef(r, palette));
    const amount = Math.min(1, Math.max(0, fill.amount ?? 0.5));
    return (x, y) => (amount > ditherThreshold(x, y, fill.pattern) ? b : a);
  }
  const stops = fill.gradient.map((r) => resolveColorRef(r, palette));
  if (stops.length === 0) throw new Error('A gradient needs at least one color');
  if (stops.length === 1) return () => stops[0];
  const dir = fill.direction ?? 'down';
  const span = (dir === 'down' || dir === 'up' ? box.y1 - box.y0 : box.x1 - box.x0) || 1;
  return (x, y) => {
    let t = dir === 'down' || dir === 'up' ? (y + 0.5 - box.y0) / span : (x + 0.5 - box.x0) / span;
    if (dir === 'up' || dir === 'left') t = 1 - t;
    const pos = Math.min(0.999999, Math.max(0, t)) * (stops.length - 1);
    const i = Math.floor(pos);
    return pos - i > ditherThreshold(x, y, fill.pattern) ? stops[i + 1] : stops[i];
  };
}

// --- Regions ---

interface Region {
  box: Box;
  /** Is the pixel center (x + 0.5, y + 0.5) inside? */
  inside: (x: number, y: number) => boolean;
}

function ellipseRegion(cx: number, cy: number, rx: number, ry: number): Region {
  return {
    box: { x0: Math.floor(cx - rx), y0: Math.floor(cy - ry), x1: Math.ceil(cx + rx), y1: Math.ceil(cy + ry) },
    inside: (x, y) => {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      return dx * dx + dy * dy <= 1;
    },
  };
}

function rectRegion(x: number, y: number, w: number, h: number, radius = 0): Region {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return {
    box: { x0: Math.floor(x), y0: Math.floor(y), x1: Math.ceil(x + w), y1: Math.ceil(y + h) },
    inside: (px, py) => {
      const cx = px + 0.5;
      const cy = py + 0.5;
      if (cx < x || cx > x + w || cy < y || cy > y + h) return false;
      if (r === 0) return true;
      // Corners: inside only within the corner circle
      const kx = cx < x + r ? x + r : cx > x + w - r ? x + w - r : cx;
      const ky = cy < y + r ? y + r : cy > y + h - r ? y + h - r : cy;
      return (cx - kx) ** 2 + (cy - ky) ** 2 <= r * r;
    },
  };
}

function polygonRegion(points: Point[]): Region {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    box: { x0: Math.floor(Math.min(...xs)), y0: Math.floor(Math.min(...ys)), x1: Math.ceil(Math.max(...xs)), y1: Math.ceil(Math.max(...ys)) },
    inside: (px, py) => {
      // Even-odd ray cast from the pixel center
      const cx = px + 0.5;
      const cy = py + 0.5;
      let hit = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > cy !== yj > cy && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    },
  };
}

function regionOf(shape: Shape): Region | null {
  switch (shape.type) {
    case 'rect':
      return rectRegion(shape.x, shape.y, shape.w, shape.h, shape.radius);
    case 'circle':
      return ellipseRegion(shape.cx, shape.cy, shape.r, shape.r);
    case 'ellipse':
      return ellipseRegion(shape.cx, shape.cy, shape.rx, shape.ry);
    case 'polygon':
      return polygonRegion(shape.points);
    default:
      return null;
  }
}

// --- Strokes and lines ---

function bresenham(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function thickSegment(a: Point, b: Point, width: number, plot: (x: number, y: number) => void): void {
  const r = width / 2;
  const [ax, ay] = a;
  const [bx, by] = b;
  const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
  for (let y = Math.floor(Math.min(ay, by) - r); y <= Math.ceil(Math.max(ay, by) + r); y++) {
    for (let x = Math.floor(Math.min(ax, bx) - r); x <= Math.ceil(Math.max(ax, bx) + r); x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / len2));
      const dx = cx - (ax + t * (bx - ax));
      const dy = cy - (ay + t * (by - ay));
      if (dx * dx + dy * dy <= r * r) plot(x, y);
    }
  }
}

function strokePolyline(points: Point[], width: number, plot: (x: number, y: number) => void): void {
  if (points.length === 1) points = [points[0], points[0]];
  for (let i = 1; i < points.length; i++) {
    if (width <= 1) {
      const [x0, y0] = points[i - 1].map(Math.floor);
      const [x1, y1] = points[i].map(Math.floor);
      bresenham(x0, y0, x1, y1, plot);
    } else {
      thickSegment(points[i - 1], points[i], width, plot);
    }
  }
}

/** Flatten a quadratic (3 points) or cubic (4 points) Bezier into a polyline */
export function flattenCurve(points: Point[]): Point[] {
  if (points.length !== 3 && points.length !== 4) throw new Error('A curve needs 3 points (quadratic) or 4 (cubic)');
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const steps = Math.max(8, Math.ceil(len / 2));
  const out: Point[] = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    if (points.length === 3) {
      const [p0, p1, p2] = points;
      out.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    } else {
      const [p0, p1, p2, p3] = points;
      out.push([
        u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
        u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
      ]);
    }
  }
  return out;
}

// --- Drawing ---

function validate(shape: Shape): void {
  const nums = Object.values(shape).filter((v): v is number => typeof v === 'number');
  if (nums.some((n) => !Number.isFinite(n) || Math.abs(n) > 4096)) throw new Error(`Shape "${shape.type}" has a number out of range`);
  if ('points' in shape) {
    if (shape.points.length === 0 || shape.points.length > MAX_POINTS) throw new Error(`Shape "${shape.type}" needs 1-${MAX_POINTS} points`);
    if (shape.type === 'polygon' && shape.points.length < 3) throw new Error('A polygon needs at least 3 points');
  }
}

/**
 * Draw shapes onto a sprite, in order. Colors may be slot names when a palette is given
 * (e.g. the "scene" schema: "sky-top", "ground", "ink"). Returns a new sprite.
 */
export function drawShapes(sprite: SpriteData, shapes: Shape[], palette?: Palette): SpriteData {
  if (shapes.length > MAX_SHAPES) throw new Error(`At most ${MAX_SHAPES} shapes per call`);
  const pixels = sprite.pixels.map((row) => [...row]);
  const { width, height } = sprite;
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) pixels[y][x] = c;
  };

  for (const shape of shapes) {
    validate(shape);
    if (shape.type === 'line' || shape.type === 'curve') {
      const c = resolveColorRef(shape.color, palette);
      const pts = shape.type === 'curve' ? flattenCurve(shape.points) : shape.points;
      strokePolyline(pts, shape.width ?? 1, (x, y) => put(x, y, c));
      continue;
    }

    const region = regionOf(shape)!;
    const { box, inside } = region;
    // Clip the box to the canvas; keep the shape's own box for gradients
    const x0 = Math.max(0, box.x0);
    const y0 = Math.max(0, box.y0);
    const x1 = Math.min(width - 1, box.x1);
    const y1 = Math.min(height - 1, box.y1);

    if (shape.fill !== undefined) {
      const color = fillFn(shape.fill, palette, box);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) put(x, y, color(x, y));
    }

    if (shape.stroke) {
      // Pixels inside the shape within `width` steps of its edge
      const c = resolveColorRef(shape.stroke.color, palette);
      const w = Math.max(1, Math.round(shape.stroke.width ?? 1));
      const near = (x: number, y: number) => {
        for (let d = 1; d <= w; d++) {
          if (!inside(x - d, y) || !inside(x + d, y) || !inside(x, y - d) || !inside(x, y + d)) return true;
        }
        return false;
      };
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x, y) && near(x, y)) put(x, y, c);
    }
  }

  return { width, height, pixels };
}
