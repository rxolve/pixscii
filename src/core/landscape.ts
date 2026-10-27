import type { SpriteData } from './types.js';
import { createEmpty } from './sprite.js';
import { drawShapes, MAX_SHAPES, type Shape, type Point } from './shapes.js';
import { SCENE } from './slots.js';
import { hashSeed } from './character.js';

/**
 * Procedural landscapes in the "scene" schema. The output uses scene slot indices only,
 * so it renders in any scene-* palette: same seed, same place, different mood.
 */

export type TimeOfDay = 'dawn' | 'noon' | 'dusk' | 'night';

export type LandscapeLayer =
  | 'sky' | 'stars' | 'sun' | 'clouds' | 'mountains' | 'hills' | 'sea' | 'forest' | 'ground' | 'rain';

export const LANDSCAPE_LAYERS: LandscapeLayer[] = [
  'sky', 'stars', 'sun', 'clouds', 'mountains', 'hills', 'sea', 'forest', 'ground', 'rain',
];

/** One preset per scene palette mood: which layers and what time of day */
export const LANDSCAPE_PRESETS: Record<string, { time: TimeOfDay; layers: LandscapeLayer[] }> = {
  dawn: { time: 'dawn', layers: ['sky', 'sun', 'clouds', 'mountains', 'hills', 'ground'] },
  home: { time: 'dusk', layers: ['sky', 'sun', 'hills', 'ground'] },
  school: { time: 'noon', layers: ['sky', 'sun', 'clouds', 'hills', 'ground'] },
  night: { time: 'night', layers: ['sky', 'stars', 'sun', 'hills', 'ground'] },
  sea: { time: 'noon', layers: ['sky', 'sun', 'clouds', 'sea'] },
  storm: { time: 'noon', layers: ['sky', 'clouds', 'sea', 'rain'] },
  window: { time: 'noon', layers: ['sky', 'sun', 'clouds', 'hills', 'ground'] },
  forest: { time: 'noon', layers: ['sky', 'sun', 'mountains', 'forest', 'ground'] },
  dusk: { time: 'dusk', layers: ['sky', 'sun', 'mountains', 'sea'] },
  stars: { time: 'night', layers: ['sky', 'stars'] },
};

export interface LandscapeOptions {
  seed: string | number;
  /** A LANDSCAPE_PRESETS key (scene mood). Sets time and layers unless given */
  preset?: string;
  time?: TimeOfDay;
  /** Drawn back to front in LANDSCAPE_LAYERS order, whatever order they are given in */
  layers?: LandscapeLayer[];
  width?: number;
  height?: number;
  /** Horizon height as a share of the canvas from the top, 0-1 (default 0.62) */
  horizon?: number;
}

/** mulberry32: small seeded PRNG */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise over [0, width): control points every `step` px, cosine-interpolated */
function valueNoise(rand: () => number, width: number, step: number): number[] {
  const knots = Array.from({ length: Math.ceil(width / step) + 2 }, () => rand());
  return Array.from({ length: width }, (_, x) => {
    const i = Math.floor(x / step);
    const t = (1 - Math.cos(((x % step) / step) * Math.PI)) / 2;
    return knots[i] * (1 - t) + knots[i + 1] * t;
  });
}

/** Jagged ridge by midpoint displacement, values 0-1 */
function ridge(rand: () => number, width: number, roughness = 0.55): number[] {
  let size = 1;
  while (size < width) size *= 2;
  const h = new Array(size + 1).fill(0);
  h[0] = rand();
  h[size] = rand();
  let amp = 0.5;
  for (let step = size; step > 1; step /= 2) {
    for (let i = step / 2; i < size; i += step) {
      h[i] = (h[i - step / 2] + h[i + step / 2]) / 2 + (rand() - 0.5) * amp;
    }
    amp *= roughness;
  }
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  return h.slice(0, width).map((v) => (v - lo) / (hi - lo || 1));
}

/** Polygon from a height profile down to `bottom` */
function profile(heights: number[], bottom: number): Point[] {
  const pts: Point[] = heights.map((y, x) => [x, y] as Point);
  pts.push([heights.length, heights[heights.length - 1]], [heights.length, bottom], [0, bottom]);
  return pts;
}

export function landscape(options: LandscapeOptions): SpriteData {
  const preset = options.preset ? LANDSCAPE_PRESETS[options.preset] : undefined;
  if (options.preset && !preset) {
    throw new Error(`Unknown preset "${options.preset}". Presets: ${Object.keys(LANDSCAPE_PRESETS).join(', ')}`);
  }
  const W = options.width ?? 128;
  const H = options.height ?? 72;
  const time = options.time ?? preset?.time ?? 'dusk';
  const want = new Set(options.layers ?? preset?.layers ?? ['sky', 'sun', 'mountains', 'hills', 'ground']);
  const hy = Math.round(H * Math.min(0.95, Math.max(0.1, options.horizon ?? 0.62)));
  const rand = rng(typeof options.seed === 'number' ? options.seed : hashSeed(options.seed));
  const S = SCENE;

  const shapes: Shape[] = [];
  const add = (...s: Shape[]) => shapes.push(...s);
  const night = time === 'night';
  const groundTop = Math.round(H * 0.84);
  // With nothing standing below the horizon, the sky fills the whole canvas
  const skyBottom = (['mountains', 'hills', 'sea', 'forest', 'ground'] as LandscapeLayer[]).some((l) => want.has(l)) ? hy : H;

  for (const layer of LANDSCAPE_LAYERS) {
    if (!want.has(layer)) continue;

    if (layer === 'sky') {
      const stops = night ? [S['sky-top'], S['sky-top'], S['sky-mid'], S['sky-low']] : [S['sky-top'], S['sky-mid'], S['sky-low']];
      add({ type: 'rect', x: 0, y: 0, w: W, h: skyBottom + 1, fill: { gradient: stops } });
    }

    if (layer === 'stars') {
      const n = Math.round((W * skyBottom) / (night ? 45 : 140));
      for (let i = 0; i < n; i++) {
        const x = Math.floor(rand() * W);
        const y = Math.floor(rand() * skyBottom * 0.8);
        const bright = rand() < 0.15;
        add({ type: 'rect', x, y, w: 1, h: 1, fill: bright ? S.light : S.cloud });
        if (bright && rand() < 0.4) {
          add({ type: 'line', points: [[x - 1, y], [x + 1, y]], color: S.light }, { type: 'line', points: [[x, y - 1], [x, y + 1]], color: S.light });
        }
      }
    }

    if (layer === 'sun') {
      const r = Math.max(2, Math.round(H * (night ? 0.06 : 0.1)));
      const [fx, fy] = { dawn: [0.22, 0.72], noon: [0.62, 0.22], dusk: [0.74, 0.85], night: [0.76, 0.2] }[time];
      const cx = Math.round(W * fx + (rand() - 0.5) * W * 0.1);
      const cy = Math.round(time === 'dawn' || time === 'dusk' ? hy * fy : H * fy);
      if (!night) add({ type: 'circle', cx, cy, r: r + 3, fill: { dither: [S['sky-low'], S.sun], amount: 0.3 } });
      add({ type: 'circle', cx, cy, r, fill: S.sun });
      if (night) add({ type: 'circle', cx: cx + Math.ceil(r * 0.6), cy: cy - Math.ceil(r * 0.3), r, fill: S['sky-top'] });
    }

    if (layer === 'clouds') {
      const storm = want.has('rain');
      const n = storm ? 7 : 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const cx = rand() * W;
        const cy = (storm ? 0.05 + rand() * 0.3 : 0.08 + rand() * 0.35) * hy;
        const rx = W * (storm ? 0.14 + rand() * 0.12 : 0.06 + rand() * 0.07);
        const ry = Math.max(2, rx * 0.25);
        add({ type: 'ellipse', cx, cy, rx: rx * 1.25, ry: ry * 1.5, fill: { dither: [S['sky-mid'], S.cloud], amount: storm ? 0.75 : 0.5 } });
        add({ type: 'ellipse', cx, cy, rx, ry, fill: S.cloud });
        add({ type: 'ellipse', cx: cx - rx * 0.4, cy: cy - ry * 0.6, rx: rx * 0.5, ry, fill: S.cloud });
      }
    }

    if (layer === 'mountains') {
      const r = ridge(rand, W);
      const top = hy - H * 0.38;
      add({ type: 'polygon', points: profile(r.map((v) => Math.round(top + (1 - v) * (hy - top))), H), fill: S.far });
    }

    if (layer === 'hills') {
      const n = valueNoise(rand, W, Math.max(8, Math.round(W / 5)));
      const top = hy - H * 0.14;
      add({ type: 'polygon', points: profile(n.map((v) => Math.round(top + (1 - v) * (hy - top))), H), fill: S.mid });
    }

    if (layer === 'sea') {
      add({ type: 'rect', x: 0, y: hy, w: W, h: H - hy, fill: { gradient: [S.water, S.water, S.near] } });
      const waves = Math.round(W * (H - hy) / 90);
      for (let i = 0; i < waves; i++) {
        const y = hy + 2 + Math.floor(rand() ** 1.6 * (H - hy - 3));
        const x = Math.floor(rand() * W);
        const len = 2 + Math.floor(rand() * 6);
        add({ type: 'line', points: [[x, y], [x + len, y]], color: S.foam });
      }
      if (want.has('sun') && !night) {
        // Sun glitter on the water under the sun's column
        const [fx] = { dawn: [0.22], noon: [0.62], dusk: [0.74], night: [0.76] }[time];
        for (let y = hy + 1; y < H; y += 2) {
          const w = 2 + Math.floor(rand() * 4);
          const x = Math.round(W * fx - w / 2 + (rand() - 0.5) * 4);
          add({ type: 'line', points: [[x, y], [x + w, y]], color: S.sun });
        }
      }
    }

    if (layer === 'forest') {
      const base = want.has('ground') ? groundTop + 1 : H;
      // Undergrowth behind the trunks, so no gap shows between trees
      add({ type: 'rect', x: 0, y: hy - 1, w: W, h: base - hy + 2, fill: { dither: [S.mid, S.near], amount: 0.35 } });
      const count = Math.round(W / 6);
      for (let i = 0; i < count; i++) {
        const x = (i + rand() * 0.8) * (W / count);
        const h = H * (0.18 + rand() * 0.22);
        if (rand() < 0.65) {
          // Pine: stacked triangles
          for (let k = 0; k < 3; k++) {
            const ty = base - h + (k * h) / 3.2;
            const half = 2 + (k + 1) * h * 0.09;
            add({ type: 'polygon', points: [[x, ty], [x + half, ty + h / 2.2], [x - half, ty + h / 2.2]], fill: S.near });
          }
        } else {
          add({ type: 'rect', x: x - 1, y: base - h * 0.45, w: 2, h: h * 0.45, fill: S.near });
          add({ type: 'circle', cx: x, cy: base - h * 0.6, r: h * 0.28, fill: S.near });
        }
      }
    }

    if (layer === 'ground') {
      const sea = want.has('sea');
      const n = valueNoise(rand, W, 10);
      const top = n.map((v) => Math.round(groundTop - v * 2));
      if (sea) {
        // A shore on one side only
        const left = rand() < 0.5;
        const reach = W * (0.25 + rand() * 0.15);
        const pts: Point[] = left
          ? [[0, groundTop - 3], [reach * 0.6, groundTop - 1], [reach, H], [0, H]]
          : [[W, groundTop - 3], [W - reach * 0.6, groundTop - 1], [W - reach, H], [W, H]];
        add({ type: 'polygon', points: pts, fill: S.ground, stroke: { color: S.near } });
      } else {
        add({ type: 'polygon', points: profile(top, H), fill: S.ground });
        add({ type: 'rect', x: 0, y: groundTop + 1, w: W, h: 2, fill: { dither: [S.ground, S.near], amount: 0.25 } });
        for (let i = 0; i < W / 8; i++) {
          const x = Math.floor(rand() * W);
          const y = top[x] + 2 + Math.floor(rand() * (H - groundTop - 3));
          add({ type: 'line', points: [[x, y], [x + 1, y - 1]], color: S.mid });
        }
      }
    }

    if (layer === 'rain') {
      const drops = Math.round((W * H) / 40);
      for (let i = 0; i < drops; i++) {
        const x = Math.floor(rand() * (W + 8));
        const y = Math.floor(rand() * H);
        add({ type: 'line', points: [[x, y], [x - 1, y + 2]], color: rand() < 0.7 ? S.foam : S.cloud });
      }
    }
  }

  // Stars and rain alone can pass the per-call shape limit, so draw in batches
  let out = createEmpty(W, H);
  for (let i = 0; i < shapes.length; i += MAX_SHAPES) out = drawShapes(out, shapes.slice(i, i + MAX_SHAPES));
  return out;
}
