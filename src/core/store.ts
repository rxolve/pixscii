import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { matchQuery, findById, filterByCategory, pickRandom, uniqueCategories } from './searchable.js';
import { loadSprite } from './sprite.js';
import type { SpriteEntry, SpriteData } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

let entries: SpriteEntry[] = [];

/** Load the sprite index */
export async function loadIndex(): Promise<void> {
  const raw = await fs.readFile(path.join(SPRITES_DIR, 'index.json'), 'utf-8');
  entries = JSON.parse(raw);
}

/** Search sprites by query string */
export function search(query: string): SpriteEntry[] {
  return matchQuery(entries, query);
}

/** Get a sprite entry by ID */
export function getById(id: string): SpriteEntry | undefined {
  return findById(entries, id);
}

/** Get sprites by category */
export function getByCategory(category: string): SpriteEntry[] {
  return filterByCategory(entries, category);
}

/** Get a random sprite entry */
export function getRandom(): SpriteEntry {
  return pickRandom(entries);
}

/** List all categories */
export function listCategories(): string[] {
  return uniqueCategories(entries);
}

/** List all sprite entries */
export function listAll(): SpriteEntry[] {
  return entries;
}

/** Load the sprite data for an entry */
export async function loadSpriteData(entry: SpriteEntry): Promise<SpriteData> {
  return loadSprite(entry.file);
}
