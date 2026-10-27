import type { SpriteData } from './types.js';
import { createEmpty } from './sprite.js';
import { drawShapes, type Shape } from './shapes.js';
import { SCENE } from './slots.js';
import { hashSeed } from './character.js';

/**
 * Creatures and beings in the "scene" schema.
 *
 * - creature(): endless symmetric robots, aliens and critters from a mask and a seed, plus asymmetric nebulae
 * - being(): a person, cat or elf at one life stage (baby, adult, old), built from shapes
 */

export type CreatureKind = 'robot' | 'alien' | 'critter' | 'nebula';
export const CREATURE_KINDS: CreatureKind[] = ['robot', 'alien', 'critter', 'nebula'];

export interface CreatureOptions {
  seed: string | number;
  kind?: CreatureKind;
  /** Width and height in pixels, even, 8-64 (default 24) */
  size?: number;
}

function rng(seed: string | number): () => number {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mask cells: what the generator may put there
const EMPTY = 0; // never body
const MAYBE = 1; // body or empty, by seed
const BODY = 2; // always body

/**
 * Mask over the right half: u = 0 at the center line to 1 at the edge, v = 0 at the top to 1 at the bottom.
 * Each kind is a few soft regions; the seed decides the MAYBE cells.
 */
const MASKS: Record<Exclude<CreatureKind, 'nebula'>, (u: number, v: number) => number> = {
  robot: (u, v) => {
    if (v < 0.1) return u < 0.12 ? MAYBE : EMPTY; // antenna
    if (v < 0.38) return u < 0.35 ? BODY : u < 0.6 ? MAYBE : EMPTY; // head
    if (v < 0.44) return u < 0.18 ? BODY : EMPTY; // neck
    if (v < 0.76) return u < 0.45 ? BODY : u < 0.85 ? MAYBE : EMPTY; // torso, arms
    if (v < 0.96) return u > 0.15 && u < 0.5 ? (u < 0.4 ? BODY : MAYBE) : EMPTY; // legs
    return EMPTY;
  },
  alien: (u, v) => {
    const d = (u / 0.75) ** 2 + ((v - 0.5) / 0.38) ** 2; // egg body
    if (d < 0.55) return BODY;
    if (d < 1.15) return MAYBE;
    if (v < 0.15 && u > 0.2 && u < 0.45) return MAYBE; // eye stalks
    if (v > 0.82 && v < 0.98 && u < 0.7 && Math.floor(u * 6) % 2 === 1) return MAYBE; // tentacles
    return EMPTY;
  },
  critter: (u, v) => {
    const d = (u / 0.7) ** 2 + ((v - 0.6) / 0.3) ** 2; // round body
    if (d < 0.6) return BODY;
    if (d < 1.1) return MAYBE;
    if (v > 0.15 && v < 0.35 && u > 0.3 && u < 0.6) return MAYBE; // ears
    if (v > 0.88 && v < 0.98 && u > 0.25 && u < 0.6) return MAYBE; // feet
    return EMPTY;
  },
};

/** Body colors a creature can be, as scene slots: base, highlight, shadow */
const SKINS: [number, number, number][] = [
  [SCENE.accent, SCENE.light, SCENE.cloth],
  [SCENE.cloth, SCENE.accent, SCENE.near],
  [SCENE.foam, SCENE.light, SCENE.water],
  [SCENE.mid, SCENE.foam, SCENE.near],
  [SCENE.skin, SCENE.light, SCENE.ground],
  [SCENE.sun, SCENE.light, SCENE['sky-low']],
];

function maskCreature(kind: Exclude<CreatureKind, 'nebula'>, n: number, rand: () => number): SpriteData {
  const half = n / 2;
  const body: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < half; x++) {
      const cell = MASKS[kind]((x + 0.5) / half, (y + 0.5) / n);
      const on = cell === BODY || (cell === MAYBE && rand() < 0.5);
      body[y][half + x] = on;
      body[y][half - 1 - x] = on; // mirror
    }
  }
  const isBody = (x: number, y: number) => x >= 0 && x < n && y >= 0 && y < n && body[y][x];
  // Drop stray pixels: body cells with fewer than two body neighbors. Symmetric in, symmetric out
  const stray: [number, number][] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (body[y][x] && [isBody(x - 1, y), isBody(x + 1, y), isBody(x, y - 1), isBody(x, y + 1)].filter(Boolean).length < 2) stray.push([x, y]);
    }
  }
  for (const [x, y] of stray) body[y][x] = false;
  const [base, hi, lo] = SKINS[Math.floor(rand() * SKINS.length)];
  const out = createEmpty(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (isBody(x, y)) {
        // Light from the top: top edges highlight, bottom edges shade
        out.pixels[y][x] = !isBody(x, y - 1) ? hi : !isBody(x, y + 1) ? lo : base;
      } else if (isBody(x - 1, y) || isBody(x + 1, y) || isBody(x, y - 1) || isBody(x, y + 1)) {
        out.pixels[y][x] = SCENE.ink; // outline
      }
    }
  }
  // Eyes: a symmetric pair in the upper body
  const eyeRows = { robot: [0.2, 0.3], alien: [0.32, 0.45], critter: [0.48, 0.58] }[kind];
  for (let tries = 0; tries < 12; tries++) {
    const y = Math.floor(n * (eyeRows[0] + rand() * (eyeRows[1] - eyeRows[0])));
    // Column half + k mirrors column half - 1 - k, so the pair stays symmetric
    const xr = half + 1 + Math.floor(rand() * (half * 0.5));
    if (isBody(xr, y) && isBody(xr, y - 1) && isBody(xr, y + 1)) {
      out.pixels[y][xr] = SCENE.ink;
      out.pixels[y][n - 1 - xr] = SCENE.ink;
      break;
    }
  }
  return out;
}

/** Value noise in 2D on a coarse grid, bilinear */
function noise2(rand: () => number, n: number, cell: number): number[][] {
  const g = Math.ceil(n / cell) + 2;
  const knots = Array.from({ length: g }, () => Array.from({ length: g }, () => rand()));
  return Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => {
      const gx = x / cell;
      const gy = y / cell;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const top = knots[iy][ix] * (1 - fx) + knots[iy][ix + 1] * fx;
      const bot = knots[iy + 1][ix] * (1 - fx) + knots[iy + 1][ix + 1] * fx;
      return top * (1 - fy) + bot * fy;
    }),
  );
}

function nebula(n: number, rand: () => number): SpriteData {
  const coarse = noise2(rand, n, Math.max(3, n / 4));
  const fine = noise2(rand, n, Math.max(2, n / 10));
  const out = createEmpty(n, n);
  const c = (n - 1) / 2;
  const ramp = [SCENE['sky-mid'], SCENE['sky-low'], SCENE.accent, SCENE.cloud, SCENE.light];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - c, y - c) / (n / 2);
      const v = coarse[y][x] * 0.65 + fine[y][x] * 0.35 - r * 0.75 + 0.2;
      if (v < 0.12) continue;
      const level = Math.min(ramp.length - 1, Math.floor((v - 0.12) * ramp.length * 1.6));
      out.pixels[y][x] = ramp[level];
    }
  }
  // A few stars caught inside
  for (let i = 0; i < n / 4; i++) {
    const x = Math.floor(rand() * n);
    const y = Math.floor(rand() * n);
    if (out.pixels[y][x] >= 0) out.pixels[y][x] = SCENE.light;
  }
  return out;
}

export function creature(options: CreatureOptions): SpriteData {
  const n = options.size ?? 24;
  if (n < 8 || n > 64 || n % 2) throw new Error('Creature size must be even, 8-64');
  const kind = options.kind ?? 'alien';
  const rand = rng(`${kind}:${options.seed}`);
  return kind === 'nebula' ? nebula(n, rand) : maskCreature(kind, n, rand);
}

// --- Beings at life stages ---

export type BeingSpecies = 'human' | 'cat' | 'elf';
export type LifeStage = 'baby' | 'adult' | 'old';
export const BEING_SPECIES: BeingSpecies[] = ['human', 'cat', 'elf'];
export const LIFE_STAGES: LifeStage[] = ['baby', 'adult', 'old'];

export interface BeingOptions {
  species: BeingSpecies;
  stage: LifeStage;
  /** Varies hair and clothes */
  seed?: string | number;
}

/** A 24×24 being drawn with shapes in scene slots, transparent around it */
export function being(options: BeingOptions): SpriteData {
  const { species, stage } = options;
  const rand = rng(`${species}:${options.seed ?? 0}`);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const ink = { color: SCENE.ink };
  const s: Shape[] = [];

  if (species === 'cat') {
    const fur = pick([SCENE.ground, SCENE.cloud, SCENE.sun, SCENE.far]);
    const scale = stage === 'baby' ? 0.7 : 1;
    const cy = stage === 'baby' ? 17 : 15;
    const plump = stage === 'old' ? 1.15 : 1;
    const bx = 13;
    const tailUp = stage !== 'old';
    s.push(
      { type: 'curve', points: tailUp ? [[bx + 6 * scale, cy], [bx + 10 * scale, cy - 2], [bx + 8 * scale, cy - 8 * scale]] : [[bx + 6 * scale, cy + 1], [bx + 10 * scale, cy + 3], [bx + 11 * scale, cy + 6 * scale]], color: SCENE.ink, width: 3 },
      { type: 'curve', points: tailUp ? [[bx + 6 * scale, cy], [bx + 10 * scale, cy - 2], [bx + 8 * scale, cy - 8 * scale]] : [[bx + 6 * scale, cy + 1], [bx + 10 * scale, cy + 3], [bx + 11 * scale, cy + 6 * scale]], color: fur, width: 1 },
      { type: 'ellipse', cx: bx, cy, rx: 6.5 * scale * plump, ry: 3.8 * scale * plump, fill: fur, stroke: ink },
      { type: 'rect', x: bx - 5 * scale, y: cy + 2 * scale, w: 2, h: 4 * scale, fill: fur, stroke: ink },
      { type: 'rect', x: bx + 3 * scale, y: cy + 2 * scale, w: 2, h: 4 * scale, fill: fur, stroke: ink },
    );
    const hx = bx - 6 * scale;
    const hy = cy - 4 * scale;
    const hr = stage === 'baby' ? 3.6 : 3.2;
    s.push(
      { type: 'polygon', points: [[hx - hr, hy - 1], [hx - hr + 1, hy - hr - 2.5], [hx - 0.5, hy - hr + 0.5]], fill: fur, stroke: ink },
      { type: 'polygon', points: [[hx + hr, hy - 1], [hx + hr - 1, hy - hr - 2.5], [hx + 0.5, hy - hr + 0.5]], fill: fur, stroke: ink },
      { type: 'circle', cx: hx, cy: hy, r: hr, fill: fur, stroke: ink },
      { type: 'rect', x: Math.floor(hx - 2), y: Math.floor(hy), w: 1, h: 1, fill: stage === 'old' ? SCENE.ink : SCENE.light },
      { type: 'rect', x: Math.floor(hx + 1), y: Math.floor(hy), w: 1, h: 1, fill: stage === 'old' ? SCENE.ink : SCENE.light },
    );
    if (stage === 'old') s.push({ type: 'ellipse', cx: bx, cy: cy - 1, rx: 3, ry: 1.5, fill: { dither: [fur, SCENE.light], amount: 0.5 } });
    return drawShapes(createEmpty(24, 24), s);
  }

  // Human and elf share a body plan
  const elf = species === 'elf';
  const cloth = pick(elf ? [SCENE.mid, SCENE.accent, SCENE.foam] : [SCENE.cloth, SCENE.accent, SCENE.water]);
  const hair = stage === 'old' ? SCENE.light : pick(elf ? [SCENE.sun, SCENE.light, SCENE.accent] : [SCENE.ink, SCENE.ground, SCENE.far]);

  if (stage === 'baby') {
    // Big head, swaddled body
    s.push(
      { type: 'ellipse', cx: 12, cy: 18, rx: 4.5, ry: 4, fill: cloth, stroke: ink },
      { type: 'circle', cx: 12, cy: 11, r: 4.6, fill: SCENE.skin, stroke: ink },
      { type: 'ellipse', cx: 12, cy: 7.4, rx: 2.2, ry: 1, fill: hair },
      { type: 'rect', x: 10, y: 11, w: 1, h: 1, fill: SCENE.ink },
      { type: 'rect', x: 13, y: 11, w: 1, h: 1, fill: SCENE.ink },
    );
    if (elf) {
      s.push(
        { type: 'polygon', points: [[8, 10], [4, 7], [8, 12.5]], fill: SCENE.skin, stroke: ink },
        { type: 'polygon', points: [[16, 10], [20, 7], [16, 12.5]], fill: SCENE.skin, stroke: ink },
      );
    }
    return drawShapes(createEmpty(24, 24), s);
  }

  const old = stage === 'old';
  const lean = old ? 1 : 0; // hunch forward
  const top = elf ? 3 : 4; // elves stand taller
  const headY = top + 3.5 + lean;
  const headX = 11 + lean;
  const neck = headY + 3.5;
  // Legs, body, arms, head
  s.push(
    { type: 'line', points: [[10, 17], [10, 22]], color: SCENE.ink, width: 3 },
    { type: 'line', points: [[14, 17], [14, 22]], color: SCENE.ink, width: 3 },
    { type: 'line', points: [[10, 17], [10, 21]], color: SCENE.near },
    { type: 'line', points: [[14, 17], [14, 21]], color: SCENE.near },
    { type: 'rect', x: 8 + lean, y: neck, w: 8, h: 18 - neck, radius: 2, fill: cloth, stroke: ink },
    { type: 'line', points: [[8 + lean, neck + 2], [6 + lean, neck + 6]], color: SCENE.skin },
    { type: 'line', points: [[16 + lean, neck + 2], [18 + lean, neck + 6]], color: SCENE.skin },
  );
  if (elf) s.push({ type: 'line', points: [[headX - 2, headY - 1], [headX - 3.5, headY + 6]], color: hair, width: 3 }); // long hair, behind
  s.push(
    { type: 'circle', cx: headX, cy: headY, r: 3.6, fill: SCENE.skin, stroke: ink },
    { type: 'ellipse', cx: headX, cy: headY - 2.4, rx: 3.4, ry: 1.6, fill: hair },
    { type: 'rect', x: Math.floor(headX - 1.5), y: Math.floor(headY), w: 1, h: 1, fill: SCENE.ink },
    { type: 'rect', x: Math.floor(headX + 1), y: Math.floor(headY), w: 1, h: 1, fill: SCENE.ink },
  );
  if (elf) {
    // Pointed ears over the hair, reaching out past the head
    s.push(
      { type: 'polygon', points: [[headX - 3, headY - 0.5], [headX - 7, headY - 3], [headX - 3, headY + 1.5]], fill: SCENE.skin, stroke: ink },
      { type: 'polygon', points: [[headX + 3, headY - 0.5], [headX + 7, headY - 3], [headX + 3, headY + 1.5]], fill: SCENE.skin, stroke: ink },
    );
  }
  if (old) {
    // Cane or staff
    const stick = elf ? SCENE.sun : SCENE.ground;
    s.push({ type: 'line', points: [[19, elf ? 6 : 12], [19, 22]], color: SCENE.ink, width: 3 }, { type: 'line', points: [[19, elf ? 6 : 12], [19, 21]], color: stick });
  }
  return drawShapes(createEmpty(24, 24), s);
}
