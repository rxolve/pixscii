import { describe, it, expect } from 'vitest';
import { computeFrameCount, composeFrame, composeAllFrames } from './scene.js';
import type { SpriteData } from './types.js';
import type { ActorDef, SceneDef } from './scene.js';

function make(w: number, h: number, fill = -1): SpriteData {
  return {
    width: w,
    height: h,
    pixels: Array.from({ length: h }, () => new Array(w).fill(fill)),
  };
}

describe('computeFrameCount', () => {
  it('single actor with 3-point path → 3', () => {
    const actors: ActorDef[] = [{ poses: [make(4, 4)], path: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 }] }];
    expect(computeFrameCount(actors)).toBe(3);
  });

  it('two actors, longest wins', () => {
    const actors: ActorDef[] = [
      { poses: [make(4, 4)], path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }] },
      { poses: [make(4, 4)], path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] },
    ];
    expect(computeFrameCount(actors)).toBe(5);
  });

  it('empty actors array → 1', () => {
    expect(computeFrameCount([])).toBe(1);
  });
});

describe('composeFrame', () => {
  it('background only', () => {
    const bg = make(8, 8, 5);
    const scene: SceneDef = { background: bg, width: 8, height: 8, actors: [] };
    const f = composeFrame(scene, 0);
    expect(f.pixels[0][0]).toBe(5);
    expect(f.width).toBe(8);
  });

  it('no background → transparent', () => {
    const scene: SceneDef = { background: null, width: 8, height: 8, actors: [] };
    const f = composeFrame(scene, 0);
    expect(f.pixels[0][0]).toBe(-1);
  });

  it('actor placed at correct position', () => {
    const actor: ActorDef = {
      poses: [make(2, 2, 8)],
      path: [{ x: 3, y: 4 }],
    };
    const scene: SceneDef = { background: null, width: 8, height: 8, actors: [actor] };
    const f = composeFrame(scene, 0);
    expect(f.pixels[4][3]).toBe(8);
    expect(f.pixels[4][4]).toBe(8);
    expect(f.pixels[5][3]).toBe(8);
    expect(f.pixels[0][0]).toBe(-1); // rest is transparent
  });

  it('pose cycles correctly', () => {
    const poseA = make(2, 2, 1);
    const poseB = make(2, 2, 2);
    const actor: ActorDef = {
      poses: [poseA, poseB],
      path: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
    };
    const scene: SceneDef = { background: null, width: 4, height: 4, actors: [actor] };
    expect(composeFrame(scene, 0).pixels[0][0]).toBe(1); // pose A
    expect(composeFrame(scene, 1).pixels[0][0]).toBe(2); // pose B
    expect(composeFrame(scene, 2).pixels[0][0]).toBe(1); // pose A again
  });

  it('actor stops appearing after path ends', () => {
    const actor: ActorDef = {
      poses: [make(2, 2, 8)],
      path: [{ x: 0, y: 0 }], // only 1 frame
    };
    const scene: SceneDef = { background: null, width: 4, height: 4, actors: [actor] };
    expect(composeFrame(scene, 0).pixels[0][0]).toBe(8);
    expect(composeFrame(scene, 1).pixels[0][0]).toBe(-1); // gone
  });

  it('two actors both appear', () => {
    const a1: ActorDef = { poses: [make(2, 2, 1)], path: [{ x: 0, y: 0 }] };
    const a2: ActorDef = { poses: [make(2, 2, 2)], path: [{ x: 4, y: 0 }] };
    const scene: SceneDef = { background: null, width: 8, height: 4, actors: [a1, a2] };
    const f = composeFrame(scene, 0);
    expect(f.pixels[0][0]).toBe(1);
    expect(f.pixels[0][4]).toBe(2);
  });
});

describe('composeAllFrames', () => {
  it('returns correct frame count', () => {
    const actor: ActorDef = {
      poses: [make(2, 2, 1)],
      path: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }],
    };
    const scene: SceneDef = { background: null, width: 8, height: 4, actors: [actor] };
    const frames = composeAllFrames(scene);
    expect(frames.length).toBe(3);
  });

  it('each frame is a distinct object', () => {
    const actor: ActorDef = {
      poses: [make(2, 2, 1)],
      path: [{ x: 0, y: 0 }, { x: 2, y: 0 }],
    };
    const scene: SceneDef = { background: null, width: 8, height: 4, actors: [actor] };
    const frames = composeAllFrames(scene);
    expect(frames[0]).not.toBe(frames[1]);
  });

  it('actor moves across frames', () => {
    const actor: ActorDef = {
      poses: [make(2, 2, 8)],
      path: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    };
    const scene: SceneDef = { background: null, width: 8, height: 4, actors: [actor] };
    const frames = composeAllFrames(scene);
    expect(frames[0].pixels[0][0]).toBe(8);
    expect(frames[0].pixels[0][4]).toBe(-1);
    expect(frames[1].pixels[0][4]).toBe(8);
    expect(frames[1].pixels[0][0]).toBe(-1);
  });
});
