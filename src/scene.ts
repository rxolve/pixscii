import type { SpriteData } from './types.js';
import { createEmpty, overlayPart } from './sprite.js';

export interface ActorDef {
  poses: SpriteData[];
  path: Array<{ x: number; y: number }>;
}

export interface SceneDef {
  background: SpriteData | null;
  width: number;
  height: number;
  actors: ActorDef[];
}

/** Compute total frame count from actor paths */
export function computeFrameCount(actors: ActorDef[]): number {
  if (actors.length === 0) return 1;
  return Math.max(1, ...actors.map((a) => a.path.length));
}

/** Compose a single frame of the scene at the given index */
export function composeFrame(scene: SceneDef, frameIndex: number): SpriteData {
  let canvas = createEmpty(scene.width, scene.height);

  if (scene.background) {
    canvas = overlayPart(canvas, scene.background, 0, 0);
  }

  for (const actor of scene.actors) {
    if (frameIndex >= actor.path.length) continue;
    const pos = actor.path[frameIndex];
    const pose = actor.poses[frameIndex % actor.poses.length];
    canvas = overlayPart(canvas, pose, pos.x, pos.y);
  }

  return canvas;
}

/** Compose all frames of the scene */
export function composeAllFrames(scene: SceneDef): SpriteData[] {
  const count = computeFrameCount(scene.actors);
  const frames: SpriteData[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(composeFrame(scene, i));
  }
  return frames;
}
