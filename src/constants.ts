import type { RGBA } from './types.js';

/** PICO-8 16-color palette as RGBA */
export const PICO8_COLORS: RGBA[] = [
  [0, 0, 0, 255],       // 0  black
  [29, 43, 83, 255],     // 1  dark-blue
  [126, 37, 83, 255],    // 2  dark-purple
  [0, 135, 81, 255],     // 3  dark-green
  [171, 82, 54, 255],    // 4  brown
  [95, 87, 79, 255],     // 5  dark-grey
  [194, 195, 199, 255],  // 6  light-grey
  [255, 241, 232, 255],  // 7  white
  [255, 0, 77, 255],     // 8  red
  [255, 163, 0, 255],    // 9  orange
  [255, 236, 39, 255],   // 10 yellow
  [0, 228, 54, 255],     // 11 green
  [41, 173, 255, 255],   // 12 blue
  [131, 118, 156, 255],  // 13 lavender
  [255, 119, 168, 255],  // 14 pink
  [255, 204, 170, 255],  // 15 light-peach
];

/** Default palette ID */
export const DEFAULT_PALETTE = 'pico8';

/** Maximum scale factor for PNG output */
export const MAX_SCALE = 16;

/** Default scale factor */
export const DEFAULT_SCALE = 8;

/** Maximum canvas dimensions for compose/tilemap */
export const MAX_CANVAS_WIDTH = 256;
export const MAX_CANVAS_HEIGHT = 256;

/** Maximum number of compose layers */
export const MAX_COMPOSE_LAYERS = 20;

/** Maximum tilemap grid dimensions */
export const MAX_TILEMAP_COLS = 16;
export const MAX_TILEMAP_ROWS = 16;

/** Maximum character seed length */
export const MAX_SEED_LENGTH = 200;

/** Maximum base64 input size for convert */
export const MAX_BASE64_SIZE = 10 * 1024 * 1024;

/** Maximum fetch size for convert */
export const MAX_FETCH_SIZE = 20 * 1024 * 1024;

/** Species options for character generation */
export const SPECIES = ['human', 'elf', 'dwarf', 'skeleton'] as const;

/** Armor options */
export const ARMORS = ['cloth', 'leather', 'plate'] as const;

/** Weapon options */
export const WEAPONS = ['sword', 'staff', 'bow'] as const;

/** Helm options */
export const HELMS = ['hood', 'iron', 'crown'] as const;

/** Skin tone palette indices (mapped to PICO-8 colors) */
export const SKIN_TONES = [15, 14, 9, 4, 5, 0] as const;

/** Maximum number of simultaneously held canvases */
export const MAX_CANVAS_COUNT = 40;

/** Maximum pixels settable in a single pixel batch call */
export const MAX_PIXELS_PER_BATCH = 512;

/** Maximum flood fill area before aborting */
export const MAX_FILL_AREA = 4096;

/** Canvas ID prefix */
export const CANVAS_ID_PREFIX = 'cvs';

/** Threshold for switching from full inspect to region mode */
export const INSPECT_FULL_THRESHOLD = 32;

/** Maximum frames in a sequence */
export const MAX_SEQUENCE_FRAMES = 32;

/** Maximum actors in a sequence */
export const MAX_SEQUENCE_ACTORS = 8;

/** Maximum poses per actor */
export const MAX_SEQUENCE_POSES = 8;

/** Maximum frames in a spritesheet */
export const MAX_SPRITESHEET_FRAMES = 32;
