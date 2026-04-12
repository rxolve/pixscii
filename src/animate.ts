import type { SpriteData, Animation, MotionType } from './types.js';
import { createEmpty } from './sprite.js';

export const MOTION_TYPES: MotionType[] = ['idle', 'walk', 'attack', 'hurt', 'bounce', 'blink'];

/** Shift all pixels in a sprite by dx, dy */
function shiftSprite(sprite: SpriteData, dx: number, dy: number): SpriteData {
  const pixels: number[][] = [];
  for (let y = 0; y < sprite.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < sprite.width; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx >= 0 && sx < sprite.width && sy >= 0 && sy < sprite.height) {
        row.push(sprite.pixels[sy][sx]);
      } else {
        row.push(-1);
      }
    }
    pixels.push(row);
  }
  return { width: sprite.width, height: sprite.height, pixels };
}

/** Squeeze sprite vertically (squash effect) */
function squashSprite(sprite: SpriteData): SpriteData {
  const pixels = sprite.pixels.map((row) => [...row]);
  const s = ms(sprite);
  if (sprite.height >= 4) {
    for (let i = 0; i < s; i++) {
      const src = sprite.height - 1 - i;
      const dst = sprite.height - 1 - s - i;
      if (dst >= 0) pixels[dst] = [...pixels[src]];
      pixels[src] = new Array(sprite.width).fill(-1);
    }
  }
  return { width: sprite.width, height: sprite.height, pixels };
}

/** Clear random pixels for blink/flash effect */
function blinkSprite(sprite: SpriteData, visible: boolean): SpriteData {
  if (visible) return sprite;
  return createEmpty(sprite.width, sprite.height);
}

/** Scale factor for motion offsets — keeps animations proportional at any sprite size */
function ms(sprite: SpriteData): number {
  return Math.max(1, Math.round(sprite.width / 16));
}

/** Idle: subtle breathing animation */
function motionIdle(sprite: SpriteData): Animation {
  const s = ms(sprite);
  return {
    frames: [
      sprite,
      sprite,
      shiftSprite(sprite, 0, -s),
      shiftSprite(sprite, 0, -s),
      sprite,
      sprite,
    ],
    delay: 200,
    loop: true,
  };
}

/** Walk: side-to-side bobbing */
function motionWalk(sprite: SpriteData): Animation {
  const s = ms(sprite);
  return {
    frames: [
      sprite,
      shiftSprite(sprite, s, -s),
      sprite,
      shiftSprite(sprite, -s, -s),
    ],
    delay: 150,
    loop: true,
  };
}

/** Attack: lunge forward then back */
function motionAttack(sprite: SpriteData): Animation {
  const s = ms(sprite);
  return {
    frames: [
      sprite,
      shiftSprite(sprite, s, 0),
      shiftSprite(sprite, 2 * s, 0),
      shiftSprite(sprite, 3 * s, 0),
      shiftSprite(sprite, 2 * s, 0),
      shiftSprite(sprite, s, 0),
      sprite,
    ],
    delay: 80,
    loop: false,
  };
}

/** Hurt: shake left-right rapidly */
function motionHurt(sprite: SpriteData): Animation {
  const s = ms(sprite);
  return {
    frames: [
      sprite,
      shiftSprite(sprite, -2 * s, 0),
      shiftSprite(sprite, 2 * s, 0),
      shiftSprite(sprite, -s, 0),
      shiftSprite(sprite, s, 0),
      sprite,
    ],
    delay: 60,
    loop: false,
  };
}

/** Bounce: hop up and down */
function motionBounce(sprite: SpriteData): Animation {
  const s = ms(sprite);
  return {
    frames: [
      sprite,
      shiftSprite(sprite, 0, -s),
      shiftSprite(sprite, 0, -2 * s),
      shiftSprite(sprite, 0, -3 * s),
      shiftSprite(sprite, 0, -2 * s),
      shiftSprite(sprite, 0, -s),
      squashSprite(sprite),
      sprite,
    ],
    delay: 100,
    loop: true,
  };
}

/** Blink: flash visible/invisible */
function motionBlink(sprite: SpriteData): Animation {
  return {
    frames: [
      sprite,
      sprite,
      sprite,
      blinkSprite(sprite, false),
      blinkSprite(sprite, false),
      sprite,
      sprite,
      sprite,
    ],
    delay: 150,
    loop: true,
  };
}

/** Create animation frames for a sprite with the given motion */
export function createAnimation(sprite: SpriteData, motion: MotionType): Animation {
  switch (motion) {
    case 'idle': return motionIdle(sprite);
    case 'walk': return motionWalk(sprite);
    case 'attack': return motionAttack(sprite);
    case 'hurt': return motionHurt(sprite);
    case 'bounce': return motionBounce(sprite);
    case 'blink': return motionBlink(sprite);
  }
}
