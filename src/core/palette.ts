import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { Palette, RGBA } from './types.js';
import { DEFAULT_PALETTE } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PALETTES_DIR = path.join(__dirname, '..', 'sprites', 'palettes');

const palettes = new Map<string, Palette>();
const colorCache = new Map<string, RGBA>();

/** Parse hex color string to RGBA */
export function hexToRGBA(hex: string): RGBA {
  const cached = colorCache.get(hex);
  if (cached) return cached;

  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const rgba: RGBA = [r, g, b, 255];
  colorCache.set(hex, rgba);
  return rgba;
}

/** Load all palette JSON files from sprites/palettes/ */
export async function loadPalettes(): Promise<void> {
  const files = await fs.readdir(PALETTES_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(PALETTES_DIR, file), 'utf-8');
    const palette: Palette = JSON.parse(raw);
    palettes.set(palette.id, palette);
  }
}

/** Get a palette by ID, falls back to default */
export function getPalette(id?: string): Palette {
  const p = palettes.get(id ?? DEFAULT_PALETTE);
  if (!p) {
    const def = palettes.get(DEFAULT_PALETTE);
    if (!def) throw new Error(`Default palette "${DEFAULT_PALETTE}" not loaded`);
    return def;
  }
  return p;
}

/** Resolve palette index to RGBA color */
export function resolveColor(palette: Palette, index: number): RGBA {
  const color = palette.colors.find((c) => c.index === index);
  if (!color) return [0, 0, 0, 0]; // transparent for unknown
  return hexToRGBA(color.hex);
}

/** List all loaded palette IDs */
export function listPalettes(): string[] {
  return [...palettes.keys()];
}
