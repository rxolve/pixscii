import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import type { CharacterTemplate, PartData, SpriteData, CharacterOptions } from './types.js';
import { overlayPart, recolorIndices } from './sprite.js';
import { SPECIES, ARMORS, WEAPONS, HELMS, SKIN_TONES } from './constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

// --- Cached data ---
const templates = new Map<string, CharacterTemplate>();
const parts = new Map<string, PartData>();

// --- FNV-1a 32-bit hash (deterministic, no dependencies) ---

export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// --- Slot-independent selection via bit rotation + golden ratio mixing ---

export function selectIndex(hash: number, slot: number, count: number): number {
  const rotation = (slot * 7) % 32;
  const rotated = ((hash << rotation) | (hash >>> (32 - rotation))) >>> 0;
  const mixed = Math.imul(rotated, 0x9e3779b9) >>> 0;
  return mixed % count;
}

// --- Loading ---

async function loadJSON<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(path.join(SPRITES_DIR, filePath), 'utf-8');
  return JSON.parse(raw);
}

export async function loadCharacterAssets(): Promise<void> {
  // Load body templates
  for (const species of SPECIES) {
    const data = await loadJSON<CharacterTemplate>(`characters/${species}.json`);
    templates.set(species, data);
  }

  // Load parts
  const partDirs = [
    { dir: 'parts/heads', items: SPECIES },
    { dir: 'parts/armor', items: ARMORS },
    { dir: 'parts/weapons', items: WEAPONS },
    { dir: 'parts/helms', items: HELMS },
  ];

  for (const { dir, items } of partDirs) {
    for (const item of items) {
      const data = await loadJSON<PartData>(`${dir}/${item}.json`);
      parts.set(`${dir.split('/')[1]}/${item}`, data);
    }
  }
}

// --- Character generation ---

function resolveOptions(options: CharacterOptions) {
  const hash = hashSeed(options.seed);
  const species = options.species && SPECIES.includes(options.species as typeof SPECIES[number])
    ? options.species
    : SPECIES[selectIndex(hash, 0, SPECIES.length)];
  const armor = options.armor && ARMORS.includes(options.armor as typeof ARMORS[number])
    ? options.armor
    : ARMORS[selectIndex(hash, 1, ARMORS.length)];
  const weapon = options.weapon && WEAPONS.includes(options.weapon as typeof WEAPONS[number])
    ? options.weapon
    : WEAPONS[selectIndex(hash, 2, WEAPONS.length)];
  const helm = options.helm && HELMS.includes(options.helm as typeof HELMS[number])
    ? options.helm
    : HELMS[selectIndex(hash, 3, HELMS.length)];
  const skinIdx = options.skin != null && options.skin >= 0 && options.skin < SKIN_TONES.length
    ? options.skin
    : selectIndex(hash, 4, SKIN_TONES.length);
  return { species, armor, weapon, helm, skinIdx };
}

export function generateCharacter(options: CharacterOptions): SpriteData {
  const { species, armor, weapon, helm, skinIdx } = resolveOptions(options);

  // Get template
  const template = templates.get(species);
  if (!template) throw new Error(`Character template "${species}" not loaded`);

  // Start with body (no recolor yet)
  let sprite: SpriteData = {
    width: template.width,
    height: template.height,
    pixels: template.pixels.map((row) => [...row]),
  };

  // Layer: armor → head → helm → weapon (back to front)
  const armorPart = parts.get(`armor/${armor}`);
  if (armorPart) {
    sprite = overlayPart(sprite, armorPart, template.anchors.armor.x, template.anchors.armor.y);
  }

  const headPart = parts.get(`heads/${species}`);
  if (headPart) {
    sprite = overlayPart(sprite, headPart, template.anchors.head.x, template.anchors.head.y);
  }

  // Apply skin recolor AFTER head overlay so head + body match
  sprite = recolorIndices(sprite, template.skinIndices, SKIN_TONES[skinIdx]);

  const helmPart = parts.get(`helms/${helm}`);
  if (helmPart) {
    sprite = overlayPart(sprite, helmPart, template.anchors.helm.x, template.anchors.helm.y);
  }

  const weaponPart = parts.get(`weapons/${weapon}`);
  if (weaponPart) {
    sprite = overlayPart(sprite, weaponPart, template.anchors.weapon.x, template.anchors.weapon.y);
  }

  return sprite;
}

/** Get human-readable description of generated character parts */
export function describeCharacter(options: CharacterOptions): string {
  const { species, armor, weapon, helm, skinIdx } = resolveOptions(options);
  return `${species} — ${armor} armor, ${weapon}, ${helm} helm, skin tone ${skinIdx}`;
}
