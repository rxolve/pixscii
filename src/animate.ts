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
  // Move bottom rows up by 1
  if (sprite.height >= 4) {
    const lastRow = pixels[sprite.height - 1];
    const secondLast = pixels[sprite.height - 2];
    pixels[sprite.height - 2] = lastRow;
    pixels[sprite.height - 1] = new Array(sprite.width).fill(-1);
  }
  return { width: sprite.width, height: sprite.height, pixels };
}

/** Clear random pixels for blink/flash effect */
function blinkSprite(sprite: SpriteData, visible: boolean): SpriteData {
  if (visible) return sprite;
  return createEmpty(sprite.width, sprite.height);
}

/** Idle: subtle breathing animation (shift up/down by 1px) */
function motionIdle(sprite: SpriteData): Animation {
  return {
    frames: [
      sprite,
      sprite,
      shiftSprite(sprite, 0, -1),
      shiftSprite(sprite, 0, -1),
      sprite,
      sprite,
    ],
    delay: 200,
    loop: true,
  };
}

/** Walk: side-to-side bobbing */
function motionWalk(sprite: SpriteData): Animation {
  return {
    frames: [
      sprite,
      shiftSprite(sprite, 1, -1),
      shiftSprite(sprite, 0, 0),
      shiftSprite(sprite, -1, -1),
    ],
    delay: 150,
    loop: true,
  };
}

/** Attack: lunge forward then back */
function motionAttack(sprite: SpriteData): Animation {
  return {
    frames: [
      sprite,
      shiftSprite(sprite, 1, 0),
      shiftSprite(sprite, 2, 0),
      shiftSprite(sprite, 3, 0),
      shiftSprite(sprite, 2, 0),
      shiftSprite(sprite, 1, 0),
      sprite,
    ],
    delay: 80,
    loop: false,
  };
}

/** Hurt: shake left-right rapidly */
function motionHurt(sprite: SpriteData): Animation {
  return {
    frames: [
      sprite,
      shiftSprite(sprite, -2, 0),
      shiftSprite(sprite, 2, 0),
      shiftSprite(sprite, -1, 0),
      shiftSprite(sprite, 1, 0),
      sprite,
    ],
    delay: 60,
    loop: false,
  };
}

/** Bounce: hop up and down */
function motionBounce(sprite: SpriteData): Animation {
  return {
    frames: [
      sprite,
      shiftSprite(sprite, 0, -1),
      shiftSprite(sprite, 0, -2),
      shiftSprite(sprite, 0, -3),
      shiftSprite(sprite, 0, -2),
      shiftSprite(sprite, 0, -1),
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
