import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

import { loadPalettes, getPalette } from './palette.js';
import { renderToBuffer } from './render.js';
import { loadIndex, getById, loadSpriteData } from './store.js';
import { quantizeToSprite } from './convert.js';
import type { SpriteEntry } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'sprites');

/** Parse CLI args into a flags map */
function parseArgs(args: string[]): { positional: string[]; flags: Record<string, string> } {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'no-index') {
        flags[key] = 'true';
      } else {
        flags[key] = args[++i] ?? '';
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

/** Convert "some-thing" to "Some Thing" */
function toTitleCase(s: string): string {
  return s
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Import a PNG file as a sprite */
async function importSprite(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const filePath = positional[0];

  if (!filePath) {
    console.error('Usage: pixscii import <file.png> [options]');
    console.error('Options:');
    console.error('  --id <id>          Sprite ID (default: filename stem)');
    console.error('  --name <name>      Display name (default: Title Case of id)');
    console.error('  --category <cat>   Category: items | tiles | effects | ui | objects');
    console.error('  --tags <t1,t2>     Comma-separated tags');
    console.error('  --width <n>        Target width (default: auto-detect)');
    console.error('  --height <n>       Target height (default: auto-detect)');
    console.error('  --palette <id>     Palette ID (default: pico8)');
    console.error('  --no-index         Skip updating sprites/index.json');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(absPath);
  const meta = await sharp(buffer).metadata();

  const id = flags.id ?? path.basename(filePath, path.extname(filePath));
  const name = flags.name ?? toTitleCase(id);
  const category = flags.category ?? 'items';
  const tags = flags.tags ? flags.tags.split(',').map((t) => t.trim()) : [];
  const width = flags.width ? parseInt(flags.width, 10) : meta.width ?? 16;
  const height = flags.height ? parseInt(flags.height, 10) : meta.height ?? 16;
  const skipIndex = flags['no-index'] === 'true';

  await loadPalettes();
  const palette = getPalette(flags.palette);
  const sprite = await quantizeToSprite(buffer, palette, width, height);

  // Write sprite JSON
  const outDir = path.join(SPRITES_DIR, category);
  await fsPromises.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${id}.json`);
  await fsPromises.writeFile(outPath, JSON.stringify(sprite), 'utf-8');

  // Update index
  if (!skipIndex) {
    const indexPath = path.join(SPRITES_DIR, 'index.json');
    const raw = await fsPromises.readFile(indexPath, 'utf-8');
    const index: SpriteEntry[] = JSON.parse(raw);

    const entry: SpriteEntry = {
      id,
      name,
      category,
      tags,
      file: `${category}/${id}.json`,
      width: sprite.width,
      height: sprite.height,
    };

    const existing = index.findIndex((e) => e.id === id);
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }

    await fsPromises.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8');
  }

  const relPath = path.relative(process.cwd(), outPath);
  console.log(`Imported: ${id} (${sprite.width}x${sprite.height}) → ${relPath}`);
  console.log(`  category: ${category}, palette: ${palette.id}`);
  if (tags.length) console.log(`  tags: ${tags.join(', ')}`);
}

/** Export a sprite as a PNG file */
async function exportSprite(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const spriteId = positional[0];

  if (!spriteId) {
    console.error('Usage: pixscii export <sprite-id> [options]');
    console.error('Options:');
    console.error('  --out <file.png>   Output path (default: <id>.png)');
    console.error('  --scale <n>        Scale factor (default: 1)');
    console.error('  --palette <id>     Palette ID (default: pico8)');
    process.exit(1);
  }

  await Promise.all([loadIndex(), loadPalettes()]);

  const entry = getById(spriteId);
  if (!entry) {
    console.error(`Sprite "${spriteId}" not found`);
    process.exit(1);
  }

  const scale = flags.scale ? parseInt(flags.scale, 10) : 1;
  const palette = getPalette(flags.palette);
  const sprite = await loadSpriteData(entry);
  const pngBuffer = await renderToBuffer(sprite, palette, scale);

  const outPath = path.resolve(flags.out ?? `${spriteId}.png`);
  fs.writeFileSync(outPath, pngBuffer);

  const relPath = path.relative(process.cwd(), outPath);
  console.log(`Exported: ${spriteId} (${sprite.width}x${sprite.height} @ ${scale}x) → ${relPath}`);
}

/** CLI entry point */
export async function runCLI(args: string[]): Promise<void> {
  const subcommand = args[0];
  const rest = args.slice(1);

  switch (subcommand) {
    case 'import':
      await importSprite(rest);
      break;
    case 'export':
      await exportSprite(rest);
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Usage: pixscii <import|export> [options]');
      process.exit(1);
  }
}
