import { matchQuery, findById, filterByCategory, pickRandom, uniqueCategories } from './searchable.js';
import { loadSprite } from './sprite.js';
import type { SpriteEntry, SpriteData } from './types.js';
import { assets } from './assets.js';

let entries: SpriteEntry[] = [];

/** Load the sprite index */
export async function loadIndex(): Promise<void> {
  entries = (await assets().readJSON('index.json')) as SpriteEntry[];
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
