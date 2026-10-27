import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { defineTool } from '../tool-utils.js';
import { createAnimation, MOTION_TYPES } from '../animate.js';
import { generateCharacter } from '../character.js';
import { getById, loadSpriteData } from '../store.js';
import { getPalette } from '../palette.js';
import { renderToBase64 } from '../render.js';
import { storeCanvas, requireCanvas } from '../canvas.js';
import { composeAllFrames } from '../scene.js';
import { buildScene } from '../scene-builder.js';
import type { ActorDef, SceneDef } from '../scene.js';
import type { SpriteData, MotionType } from '../types.js';
import { DEFAULT_SCALE, DEFAULT_SCENE_DELAY, MAX_SCALE, MAX_SEED_LENGTH, MAX_CANVAS_WIDTH, MAX_CANVAS_HEIGHT, MAX_SEQUENCE_FRAMES, MAX_SEQUENCE_ACTORS, MAX_SEQUENCE_POSES, MAX_SCENE_ACTORS, MAX_SCENE_FRAMES, SPECIES, ARMORS, WEAPONS, HELMS, SKIN_TONES } from '../constants.js';

export function register(server: McpServer): void {
  // --- animate tool ---
  defineTool(server, 'animate',
    'Animate a sprite or character with pixel motion. Returns multiple PNG frames or a spritesheet.',
    {
      id: z.string().optional().describe('Sprite ID to animate (use this OR seed)'),
      seed: z.string().max(MAX_SEED_LENGTH).optional().describe('Character seed to animate (use this OR id)'),
      motion: z.enum(MOTION_TYPES).describe(`Motion type: ${MOTION_TYPES.join(', ')}`),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ id, seed, motion, scale, palette: paletteId }) => {
      if (!id && !seed) {
        return {
          content: [{ type: 'text' as const, text: 'Provide either "id" or "seed", not both or neither.' }],
          isError: true,
        };
      }
      if (id && seed) {
        return {
          content: [{ type: 'text' as const, text: 'Provide either "id" or "seed", not both.' }],
          isError: true,
        };
      }

      let sprite: SpriteData;
      if (seed) {
        sprite = generateCharacter({ seed });
      } else {
        const entry = getById(id!);
        if (!entry) {
          return {
            content: [{ type: 'text' as const, text: `Sprite "${id}" not found` }],
            isError: true,
          };
        }
        sprite = await loadSpriteData(entry);
      }

      const pal = getPalette(paletteId);
      const anim = createAnimation(sprite, motion as MotionType);

      const frameImages = await Promise.all(
        anim.frames.map((frame) => renderToBase64(frame, pal, scale)),
      );

      const content: ({ type: 'image'; data: string; mimeType: 'image/png' } | { type: 'text'; text: string })[] = [];
      for (const data of frameImages) {
        content.push({ type: 'image' as const, data, mimeType: 'image/png' as const });
      }
      content.push({
        type: 'text' as const,
        text: `Animation: ${motion}, ${anim.frames.length} frames, ${anim.delay}ms delay, ${anim.loop ? 'looping' : 'once'}`,
      });

      return { content };
    },
  );

  // --- sequence tool ---
  defineTool(server, 'sequence',
    'Animate actors across a scene. Each actor has a pose cycle and a path of positions. Returns one PNG per frame.',
    {
      background: z.string().optional().describe('Canvas ID for the background (omit for transparent)'),
      width: z.number().int().min(16).max(MAX_CANVAS_WIDTH).describe('Scene width in pixels'),
      height: z.number().int().min(16).max(MAX_CANVAS_HEIGHT).describe('Scene height in pixels'),
      actors: z.array(z.object({
        poses: z.array(z.string()).min(1).max(MAX_SEQUENCE_POSES).describe('Canvas IDs for pose cycle'),
        path: z.array(z.object({
          x: z.number().int().describe('X position'),
          y: z.number().int().describe('Y position'),
        })).min(1).describe('Position per frame (frame count = longest path)'),
      })).min(1).max(MAX_SEQUENCE_ACTORS).describe('Actors to animate'),
      delay: z.number().int().min(50).max(2000).optional().describe('ms between frames (default 150)'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ background, width, height, actors, delay, scale, palette: paletteId }) => {
      const pal = getPalette(paletteId);
      const bgData = background ? requireCanvas(background).data : null;

      const actorDefs: ActorDef[] = actors.map((a: { poses: string[]; path: Array<{ x: number; y: number }> }) => ({
        poses: a.poses.map((id: string) => requireCanvas(id).data),
        path: a.path,
      }));

      const scene: SceneDef = { background: bgData, width, height, actors: actorDefs };
      let frames = composeAllFrames(scene);

      let truncated = false;
      if (frames.length > MAX_SEQUENCE_FRAMES) {
        frames = frames.slice(0, MAX_SEQUENCE_FRAMES);
        truncated = true;
      }

      const frameImages = await Promise.all(
        frames.map((f) => renderToBase64(f, pal, scale)),
      );

      const frameIds = frames.map((f) =>
        storeCanvas({ data: f, width, height, palette: pal.id, prev: null }),
      );

      const content: ({ type: 'image'; data: string; mimeType: 'image/png' } | { type: 'text'; text: string })[] = [];
      for (const data of frameImages) {
        content.push({ type: 'image' as const, data, mimeType: 'image/png' as const });
      }

      const d = delay ?? 150;
      let text = `Sequence: ${frames.length} frames, ${d}ms delay\nframe_ids: ${frameIds.join(', ')}`;
      if (truncated) text += `\nNote: path truncated to ${MAX_SEQUENCE_FRAMES} frames.`;

      content.push({ type: 'text' as const, text });
      return { content };
    },
  );

  // --- animate_scene tool ---
  defineTool(server, 'animate_scene',
    'Create a full animated scene in one call. Generate characters, place them on a background, and animate them along paths. Returns multiple PNG frames.',
    {
      width: z.number().int().min(16).max(MAX_CANVAS_WIDTH).describe('Scene width in pixels'),
      height: z.number().int().min(16).max(MAX_CANVAS_HEIGHT).describe('Scene height in pixels'),
      background: z.object({
        color: z.string().length(1).optional().describe('Fill color: hex char 0-F'),
        tiles: z.array(z.array(z.string())).optional().describe('Tilemap grid of sprite IDs (e.g. [["grass","stone","wall"]])'),
        sprite: z.string().optional().describe('Sprite ID or canvas ID as background'),
      }).optional().describe('Background (omit for transparent)'),
      actors: z.array(z.object({
        seed: z.string().max(MAX_SEED_LENGTH).optional().describe('Character seed for procedural generation'),
        species: z.enum(SPECIES).optional(),
        armor: z.enum(ARMORS).optional(),
        weapon: z.enum(WEAPONS).optional(),
        helm: z.enum(HELMS).optional(),
        skin: z.number().int().min(0).max(SKIN_TONES.length - 1).optional(),
        sprite: z.string().optional().describe('Sprite ID or canvas ID (use instead of seed)'),
        motion: z.enum(MOTION_TYPES).optional().describe('Motion type (default "idle")'),
        from: z.object({ x: z.number().int(), y: z.number().int() }).describe('Start position'),
        to: z.object({ x: z.number().int(), y: z.number().int() }).describe('End position'),
      })).min(1).max(MAX_SCENE_ACTORS).describe('Actors to animate'),
      frames: z.number().int().min(1).max(MAX_SCENE_FRAMES).optional().describe('Frame count (default 8)'),
      delay: z.number().int().min(50).max(2000).optional().describe('ms between frames (default 150)'),
      scale: z.number().int().min(1).max(MAX_SCALE).optional().describe(`Scale factor (default ${DEFAULT_SCALE})`),
      palette: z.string().optional().describe('Palette ID (default "pico8")'),
    },
    async ({ width, height, background, actors, frames, delay, scale, palette: paletteId }) => {
      const pal = getPalette(paletteId);
      const { scene, descriptions } = await buildScene({
        width, height, background, actors, frames,
      });

      let allFrames = composeAllFrames(scene);
      let truncated = false;
      if (allFrames.length > MAX_SCENE_FRAMES) {
        allFrames = allFrames.slice(0, MAX_SCENE_FRAMES);
        truncated = true;
      }

      const frameImages = await Promise.all(
        allFrames.map((f) => renderToBase64(f, pal, scale)),
      );

      const frameIds = allFrames.map((f) =>
        storeCanvas({ data: f, width, height, palette: pal.id, prev: null }),
      );

      const content: ({ type: 'image'; data: string; mimeType: 'image/png' } | { type: 'text'; text: string })[] = [];
      for (const data of frameImages) {
        content.push({ type: 'image' as const, data, mimeType: 'image/png' as const });
      }

      const d = delay ?? DEFAULT_SCENE_DELAY;
      const actorLines = descriptions.map((desc: string) => `  - ${desc}`).join('\n');
      content.push({
        type: 'text' as const,
        text: `Scene: ${width}x${height}, ${allFrames.length} frames, ${d}ms delay\nActors:\n${actorLines}\nframe_ids: ${frameIds.join(', ')}${truncated ? `\nNote: truncated to ${MAX_SCENE_FRAMES} frames.` : ''}`,
      });

      return { content };
    },
  );
}
