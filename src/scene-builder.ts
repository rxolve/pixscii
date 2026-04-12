import type { SpriteData, MotionType } from './types.js';
import type { ActorDef, SceneDef } from './scene.js';
import { createEmpty, flipH } from './sprite.js';
import { getCanvas, parseColor } from './canvas.js';
import { getById, loadSpriteData } from './store.js';
import { generateCharacter, describeCharacter } from './character.js';
import { createAnimation } from './animate.js';
import { buildTilemap } from './tilemap.js';
import { DEFAULT_SCENE_FRAMES } from './constants.js';

export interface SceneActorInput {
  seed?: string;
  species?: string;
  armor?: string;
  weapon?: string;
  helm?: string;
  skin?: number;
  sprite?: string;
  motion?: MotionType;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface SceneBackgroundInput {
  color?: string;
  tiles?: string[][];
  sprite?: string;
}

export interface SceneInput {
  width: number;
  height: number;
  background?: SceneBackgroundInput;
  actors: SceneActorInput[];
  frames?: number;
}

/** Linear interpolation between two points over N frames */
export function interpolatePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  count: number,
): Array<{ x: number; y: number }> {
  if (count <= 1) return [from];
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(from.x + (to.x - from.x) * i / (count - 1)),
    y: Math.round(from.y + (to.y - from.y) * i / (count - 1)),
  }));
}

/** Resolve a sprite from canvas store or sprite index */
async function resolveSprite(id: string): Promise<SpriteData> {
  const cv = getCanvas(id);
  if (cv) return cv.data;
  const entry = getById(id);
  if (entry) return loadSpriteData(entry);
  throw new Error(`Sprite or canvas "${id}" not found`);
}

/** Resolve background from input */
async function resolveBackground(
  bg: SceneBackgroundInput | undefined,
  width: number,
  height: number,
): Promise<SpriteData | null> {
  if (!bg) return null;

  if (bg.tiles) {
    return buildTilemap(bg.tiles);
  }
  if (bg.sprite) {
    return resolveSprite(bg.sprite);
  }
  if (bg.color) {
    return createEmpty(width, height, parseColor(bg.color));
  }
  return null;
}

/** Build a SceneDef from high-level input */
export async function buildScene(input: SceneInput): Promise<{
  scene: SceneDef;
  descriptions: string[];
}> {
  const frameCount = input.frames ?? DEFAULT_SCENE_FRAMES;
  const background = await resolveBackground(input.background, input.width, input.height);

  const actorDefs: ActorDef[] = [];
  const descriptions: string[] = [];

  for (const actor of input.actors) {
    // 1. Resolve base sprite
    let baseSprite: SpriteData;
    let desc: string;

    if (actor.seed) {
      const options = {
        seed: actor.seed,
        species: actor.species,
        armor: actor.armor,
        weapon: actor.weapon,
        helm: actor.helm,
        skin: actor.skin,
      };
      baseSprite = generateCharacter(options);
      desc = describeCharacter(options);
    } else if (actor.sprite) {
      baseSprite = await resolveSprite(actor.sprite);
      desc = actor.sprite;
    } else {
      throw new Error('Actor must have either "seed" or "sprite"');
    }

    // 2. Flip if moving right-to-left
    if (actor.to.x < actor.from.x) {
      baseSprite = flipH(baseSprite);
    }

    // 3. Apply motion
    const motion = actor.motion ?? 'idle';
    const animation = createAnimation(baseSprite, motion);

    // 4. Generate path
    const path = interpolatePath(actor.from, actor.to, frameCount);

    // 5. Build ActorDef
    actorDefs.push({ poses: animation.frames, path });

    // 6. Description
    const fromTo = actor.from.x === actor.to.x && actor.from.y === actor.to.y
      ? `at (${actor.from.x},${actor.from.y})`
      : `(${actor.from.x},${actor.from.y})→(${actor.to.x},${actor.to.y})`;
    descriptions.push(`${desc} ${motion} ${fromTo}`);
  }

  return {
    scene: {
      background,
      width: input.width,
      height: input.height,
      actors: actorDefs,
    },
    descriptions,
  };
}
