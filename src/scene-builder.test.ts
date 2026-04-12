import { describe, it, expect, beforeAll } from 'vitest';
import { interpolatePath, buildScene } from './scene-builder.js';
import { loadCharacterAssets } from './character.js';
import { loadPalettes } from './palette.js';
import { loadIndex } from './store.js';

describe('interpolatePath', () => {
  it('1 frame returns [from]', () => {
    const path = interpolatePath({ x: 10, y: 20 }, { x: 50, y: 20 }, 1);
    expect(path).toEqual([{ x: 10, y: 20 }]);
  });

  it('horizontal movement evenly spaced', () => {
    const path = interpolatePath({ x: 0, y: 10 }, { x: 21, y: 10 }, 4);
    expect(path.length).toBe(4);
    expect(path[0]).toEqual({ x: 0, y: 10 });
    expect(path[3]).toEqual({ x: 21, y: 10 });
    // Check intermediate positions are evenly distributed
    expect(path[1].x).toBe(7);
    expect(path[2].x).toBe(14);
    // y stays constant
    for (const p of path) expect(p.y).toBe(10);
  });

  it('diagonal movement interpolates both axes', () => {
    const path = interpolatePath({ x: 0, y: 0 }, { x: 30, y: 15 }, 4);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[3]).toEqual({ x: 30, y: 15 });
    expect(path[1].y).toBe(5);
    expect(path[2].y).toBe(10);
  });

  it('from === to returns identical positions', () => {
    const path = interpolatePath({ x: 5, y: 5 }, { x: 5, y: 5 }, 4);
    for (const p of path) expect(p).toEqual({ x: 5, y: 5 });
  });
});

describe('buildScene', () => {
  beforeAll(async () => {
    await Promise.all([loadIndex(), loadPalettes(), loadCharacterAssets()]);
  });

  it('background.color produces solid fill', async () => {
    const { scene } = await buildScene({
      width: 16, height: 16,
      background: { color: '3' },
      actors: [{ seed: 'test', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
    });
    expect(scene.background).not.toBeNull();
    expect(scene.background!.pixels[0][0]).toBe(3);
    expect(scene.background!.width).toBe(16);
  });

  it('no background produces null', async () => {
    const { scene } = await buildScene({
      width: 16, height: 16,
      actors: [{ seed: 'test', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
    });
    expect(scene.background).toBeNull();
  });

  it('actor with seed generates character', async () => {
    const { scene, descriptions } = await buildScene({
      width: 32, height: 32,
      actors: [{ seed: 'hero', from: { x: 0, y: 0 }, to: { x: 16, y: 0 } }],
      frames: 4,
    });
    expect(scene.actors.length).toBe(1);
    expect(scene.actors[0].poses.length).toBeGreaterThan(0);
    expect(scene.actors[0].path.length).toBe(4);
    expect(descriptions[0]).toContain('idle');
  });

  it('actor moving right-to-left flips sprite', async () => {
    // Generate same character moving left vs right
    const { scene: sceneR } = await buildScene({
      width: 32, height: 32,
      actors: [{ seed: 'flip-test', from: { x: 0, y: 0 }, to: { x: 16, y: 0 } }],
      frames: 2,
    });
    const { scene: sceneL } = await buildScene({
      width: 32, height: 32,
      actors: [{ seed: 'flip-test', from: { x: 16, y: 0 }, to: { x: 0, y: 0 } }],
      frames: 2,
    });
    // First pose should be horizontally mirrored
    const poseR = sceneR.actors[0].poses[0];
    const poseL = sceneL.actors[0].poses[0];
    // Check that a non-transparent row is reversed
    const rowR = poseR.pixels.find((r) => r.some((p) => p >= 0));
    const rowL = poseL.pixels.find((r) => r.some((p) => p >= 0));
    if (rowR && rowL) {
      expect(rowL).toEqual([...rowR].reverse());
    }
  });

  it('path length matches frame count', async () => {
    const { scene } = await buildScene({
      width: 32, height: 32,
      actors: [{ seed: 'test', from: { x: 0, y: 0 }, to: { x: 20, y: 0 } }],
      frames: 12,
    });
    expect(scene.actors[0].path.length).toBe(12);
  });

  it('actor with sprite ID resolves from store', async () => {
    const { scene } = await buildScene({
      width: 32, height: 32,
      actors: [{ sprite: 'sword', from: { x: 0, y: 0 }, to: { x: 16, y: 0 } }],
      frames: 4,
    });
    expect(scene.actors[0].poses.length).toBeGreaterThan(0);
  });

  it('throws when actor has neither seed nor sprite', async () => {
    await expect(buildScene({
      width: 16, height: 16,
      actors: [{ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } } as any],
    })).rejects.toThrow('seed');
  });

  it('background.tiles builds tilemap', async () => {
    const { scene } = await buildScene({
      width: 32, height: 16,
      background: { tiles: [['grass', 'stone']] },
      actors: [{ seed: 'test', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
    });
    expect(scene.background).not.toBeNull();
    expect(scene.background!.width).toBe(64);
    expect(scene.background!.height).toBe(32);
  });
});
