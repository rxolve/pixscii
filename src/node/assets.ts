import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { setAssetSource, type AssetSource } from '../core/assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The bundled `sprites/` directory at the package root */
export const SPRITES_DIR = path.join(__dirname, '..', '..', 'sprites');

/** Asset source that reads `sprites/` from disk */
export function diskAssets(dir: string = SPRITES_DIR): AssetSource {
  return {
    async readJSON(file) {
      return JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8'));
    },
    async list(sub) {
      return fs.readdir(path.join(dir, sub));
    },
  };
}

/** Point core at the bundled `sprites/` directory on disk */
export function useDiskAssets(dir?: string): void {
  setAssetSource(diskAssets(dir));
}
