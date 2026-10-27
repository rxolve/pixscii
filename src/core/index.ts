/**
 * pixscii/core: the browser-safe part of pixscii. No Node built-ins, no sharp, no MCP.
 *
 * Bundled sprites load through an asset source: call setAssetSource() with something that can read
 * `sprites/` (in Node, useDiskAssets() from pixscii does this). Code that only draws, composes
 * or renders needs no asset source at all.
 */
export * from './types.js';
export * from './constants.js';
export * from './assets.js';
export * from './palette.js';
export * from './canvas.js';
export * from './sprite.js';
export * from './draw.js';
export * from './render.js';
export * from './quantize.js';
export * from './searchable.js';
export * from './store.js';
export * from './character.js';
export * from './compose.js';
export * from './tilemap.js';
export * from './animate.js';
export * from './scene.js';
export * from './scene-builder.js';
