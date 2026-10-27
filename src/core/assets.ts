/**
 * Where bundled sprite JSON comes from. Core never touches the file system:
 * the Node adapter reads `sprites/` from disk, a browser build can serve the same files any way it likes.
 */
export interface AssetSource {
  /** Read one JSON file by its path under `sprites/`, e.g. `palettes/pico8.json` */
  readJSON(file: string): Promise<unknown>;
  /** List file names in a directory under `sprites/`, e.g. `palettes` */
  list(dir: string): Promise<string[]>;
}

let source: AssetSource | null = null;

/** Set the asset source used by loadPalettes, loadIndex, loadSprite and loadCharacterAssets */
export function setAssetSource(s: AssetSource): void {
  source = s;
}

export function assets(): AssetSource {
  if (!source) {
    throw new Error('No asset source. In Node call useDiskAssets() from pixscii; elsewhere call setAssetSource()');
  }
  return source;
}
