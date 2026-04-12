/** RGBA color as [r, g, b, a] */
export type RGBA = [number, number, number, number];

/** Palette color entry */
export interface PaletteColor {
  index: number;
  hex: string;
  name: string;
}

/** Palette definition */
export interface Palette {
  id: string;
  name: string;
  colors: PaletteColor[];
}

/** Raw sprite data: 2D grid of palette indices (-1 = transparent) */
export interface SpriteData {
  width: number;
  height: number;
  pixels: number[][];
}

/** Anchor point for character part overlay */
export interface Anchor {
  x: number;
  y: number;
}

/** Character body template with anchor points for parts */
export interface CharacterTemplate extends SpriteData {
  id: string;
  species: string;
  anchors: {
    head: Anchor;
    armor: Anchor;
    helm: Anchor;
    weapon: Anchor;
  };
  skinIndices: number[];
}

/** Character part overlay (head, armor, weapon, helm) */
export interface PartData extends SpriteData {
  id: string;
  category: string;
}

/** Sprite index entry for search/catalog */
export interface SpriteEntry {
  id: string;
  name: string;
  category: string;
  tags: string[];
  file: string;
  width: number;
  height: number;
}

/** Character generation options */
export interface CharacterOptions {
  seed: string;
  species?: string;
  armor?: string;
  weapon?: string;
  helm?: string;
  skin?: number;
  scale?: number;
  palette?: string;
}

/** Animation motion type */
export type MotionType = 'idle' | 'walk' | 'attack' | 'hurt' | 'bounce' | 'blink';

/** Animation result with frames */
export interface Animation {
  frames: SpriteData[];
  delay: number;
  loop: boolean;
}

/** Compose layer definition */
export interface ComposeLayer {
  sprite: string;
  x: number;
  y: number;
}

/** In-memory editable canvas */
export interface Canvas {
  data: SpriteData;
  width: number;
  height: number;
  palette: string;
  prev: SpriteData | null;
}

/** Result of a flood fill operation */
export interface FillResult {
  result: SpriteData;
  count: number;
  leaked: boolean;
}
